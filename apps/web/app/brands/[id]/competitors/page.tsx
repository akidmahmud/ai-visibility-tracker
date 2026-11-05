import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { revalidatePath } from "next/cache";
import { EntityTable, HeatmapTable, MatrixTable } from "@/components/tables";
import { api } from "@/lib/api";
import { getCompetitors } from "@/lib/brand";
import { filterQuery, readFilters } from "@/lib/format";
import type { Heatmap, PromptMetrics, Summary } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CompetitorsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const f = readFilters(await searchParams);
  const qs = filterQuery(f);
  const [summary, heatmap, matrix, competitors] = await Promise.all([
    api<Summary>(`/brands/${id}/summary?${qs}`),
    api<Heatmap>(`/brands/${id}/competitors/heatmap?${qs}`),
    api<PromptMetrics>(`/brands/${id}/prompt-metrics?${qs}`),
    getCompetitors(id),
  ]);

  async function track(form: FormData) {
    "use server";
    const websiteUrl = String(form.get("websiteUrl") ?? "").trim();
    await api(`/brands/${id}/competitors`, {
      method: "POST",
      body: JSON.stringify({ name: form.get("name"), ...(websiteUrl ? { websiteUrl } : {}) }),
    });
    revalidatePath(`/brands/${id}/competitors`);
  }
  async function untrack(form: FormData) {
    "use server";
    await api(`/brands/${id}/competitors/${form.get("competitorId")}`, { method: "DELETE" });
    revalidatePath(`/brands/${id}/competitors`);
  }

  // handoff §9: suggest untracked entities with mention rate ≥ 10% and ≥ 5 mentions in the period
  const suggested = summary.entities.filter((e) => e.kind === "UNTRACKED" && (e.mentionRate ?? 0) >= 0.1 && e.mentions >= 5);

  return (
    <div className="space-y-8">
      <PageHeader title="Competitors" description="Every company the answers name, ranked by visibility. Track the ones that matter." />
      <section className="space-y-2">
        <h2 className="font-semibold">Leaderboard</h2>
        <p className="text-sm text-neutral-600">
          Every company the AI answers named.
          {suggested.length > 0 && ` Suggested to track (in 10%+ of answers, 5+ mentions): ${suggested.map((e) => e.name).join(", ")}.`}
        </p>
        <EntityTable
          rows={summary.entities}
          action={(e) =>
            e.kind === "UNTRACKED" ? (
              <form action={track}>
                <input type="hidden" name="name" value={e.name} />
                <input type="hidden" name="websiteUrl" value={e.domain ?? ""} />
                <Button variant="link">Track</Button>
              </form>
            ) : null
          }
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">By engine</h2>
        <p className="text-sm text-neutral-600">Visibility of the top companies on each AI engine.</p>
        <HeatmapTable data={heatmap} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">By prompt</h2>
        <p className="text-sm text-neutral-600">Who wins each question: visibility of the top 5 companies per prompt.</p>
        <MatrixTable data={matrix} href={(pid) => `/brands/${id}/prompts/${pid}?${qs}`} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Tracked competitors ({competitors.length})</h2>
        {competitors.length > 0 && (
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {competitors.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3">
                <span>
                  {c.entity.canonicalName} {c.entity.domain && <span className="text-neutral-500">· {c.entity.domain}</span>}
                </span>
                <form action={untrack}>
                  <input type="hidden" name="competitorId" value={c.id} />
                  <Button variant="link" aria-label={`Stop tracking ${c.entity.canonicalName}`}>Stop tracking</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={track} className="flex flex-wrap gap-2 rounded-lg border bg-white p-4 text-sm">
          <label className="sr-only" htmlFor="cname">Competitor name</label>
          <input id="cname" name="name" required placeholder="Competitor name" className="flex-1 rounded border px-3 py-2" />
          <label className="sr-only" htmlFor="curl">Competitor website</label>
          <input id="curl" name="websiteUrl" placeholder="website (optional)" className="flex-1 rounded border px-3 py-2" />
          <Button>Add competitor</Button>
        </form>
      </section>
    </div>
  );
}
