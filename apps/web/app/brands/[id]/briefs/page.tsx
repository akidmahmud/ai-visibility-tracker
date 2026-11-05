import { PageHeader } from "@/components/shell/app-shell";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { fmtDate, pct, vis } from "@/lib/format";
import type { PromptMetrics } from "@/lib/types";

type Brief = {
  id: string;
  promptId: string;
  generatedAt: string;
  prompt: { text: string };
  body: {
    title: string;
    summary: string;
    outline: { h2: string; points: string[] }[];
    questions: string[];
    entitiesAndFacts: string[];
    sitesToGetMentionedOn: { domain: string; why: string }[];
  };
};

export default async function BriefsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const [metrics, briefs] = await Promise.all([api<PromptMetrics>(`/brands/${id}/prompt-metrics?days=90`), api<Brief[]>(`/brands/${id}/briefs`)]);
  const latest = new Map<string, Brief>();
  for (const b of briefs) if (!latest.has(b.promptId)) latest.set(b.promptId, b);
  // the queue: prompts where you are weakest first
  const queue = metrics.prompts.filter((p) => p.isActive).sort((a, b) => (a.visibility ?? -1) - (b.visibility ?? -1));

  async function create(form: FormData) {
    "use server";
    try {
      await api(`/brands/${id}/briefs`, { method: "POST", body: JSON.stringify({ promptId: form.get("promptId"), refresh: form.get("refresh") === "true" }) });
    } catch (e) {
      redirect(`/brands/${id}/briefs?error=${encodeURIComponent((e as Error).message.includes("503") ? "No AI model is configured for briefs." : "The brief couldn't be written. Try again in a minute.")}`);
    }
    revalidatePath(`/brands/${id}/briefs`);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Content Briefs"
        description="A page plan for each question, built from what AI says about the companies that win it, the pages it cites and the searches it runs. Weakest prompts first."
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {queue.length === 0 && <p className="text-sm text-muted-foreground">No active prompts yet.</p>}
      {queue.map((p) => {
        const b = latest.get(p.id);
        return (
          <Card key={p.id} className="space-y-3 p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.text}</p>
                <p className="text-xs text-muted-foreground">
                  Visibility {p.answers ? vis(p.visibility) : "–"} · mentioned in {p.answers ? pct(p.mentionRate) : "–"} of answers
                  {b && ` · brief from ${fmtDate(b.generatedAt)}`}
                </p>
              </div>
              <form action={create}>
                <input type="hidden" name="promptId" value={p.id} />
                <input type="hidden" name="refresh" value={String(!!b)} />
                <Button variant={b ? "outline" : "default"} size="sm" disabled={!p.answers} title={!p.answers ? "Needs at least one run first" : undefined}>
                  {b ? "Rewrite brief" : "Create brief"}
                </Button>
              </form>
            </div>
            {b && (
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer font-medium">{b.body.title}</summary>
                <div className="mt-3 space-y-3">
                  <p>{b.body.summary}</p>
                  <div>
                    <p className="font-medium">Outline</p>
                    <ol className="list-decimal space-y-1 pl-5">
                      {b.body.outline.map((s) => (
                        <li key={s.h2}>
                          {s.h2}
                          <ul className="list-disc pl-5 text-muted-foreground">{s.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="font-medium">Questions to answer</p>
                    <ul className="list-disc pl-5">{b.body.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-medium">Facts and names to include</p>
                    <ul className="list-disc pl-5">{b.body.entitiesAndFacts.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                  {b.body.sitesToGetMentionedOn.length > 0 && (
                    <div>
                      <p className="font-medium">Sites to get mentioned on</p>
                      <ul className="list-disc pl-5">{b.body.sitesToGetMentionedOn.map((s) => <li key={s.domain}><span className="font-medium">{s.domain}</span>: {s.why}</li>)}</ul>
                    </div>
                  )}
                </div>
              </details>
            )}
          </Card>
        );
      })}
    </div>
  );
}
