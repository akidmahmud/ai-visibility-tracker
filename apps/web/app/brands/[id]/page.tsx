import { Download } from "lucide-react";
import { ScoreHero } from "@/components/score-hero";
import { CompetitorsCard, DomainsCard, McpBanner, RecentChats, SourceTypesCard } from "@/components/overview";
import { PageHeader } from "@/components/shell/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { VisibilityChart } from "@/components/visibility-chart";
import { api } from "@/lib/api";
import { colorOrder, getBrand, getCompetitors } from "@/lib/brand";
import { filterQuery, readFilters } from "@/lib/format";
import type { AnswerList, Heatmap, Sources, Summary, Timeseries } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Overview({ params, searchParams }: Props) {
  const { id } = await params;
  const f = readFilters(await searchParams);
  const qs = filterQuery(f);
  const [brand, competitors, summary, timeseries, sources, chats, heatmap] = await Promise.all([
    getBrand(id),
    getCompetitors(id),
    api<Summary>(`/brands/${id}/summary?${qs}`),
    api<Timeseries>(`/brands/${id}/timeseries?${qs}`),
    api<Sources>(`/brands/${id}/sources?${qs}`),
    api<AnswerList>(`/brands/${id}/answers?${qs}`),
    api<Heatmap>(`/brands/${id}/competitors/heatmap?${qs}`),
  ]);
  const base = `/brands/${id}`;
  const types = [...sources.bySiteType].sort((a, b) => b.count - a.count).map((t) => t.type);

  return (
    <>
      <PageHeader title="Overview" description={`How often AI assistants mention ${brand.name}, next to the competitors they name, over the last ${f.days} days.`}>
        <a href={`${base}/report?${qs}`} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Download className="size-4" /> Download PDF
        </a>
      </PageHeader>
      <McpBanner href="/settings/integrations#mcp" />
      <div className="space-y-6">
        <ScoreHero summary={summary} heatmap={heatmap} brand={brand.name} />
        <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <Card>
            <CardHeader title="Visibility" subtitle="You and the most-named competitors, day by day" />
            <div className="p-4 pt-3">
              <VisibilityChart data={timeseries} colorOrder={colorOrder(brand, competitors)} bare />
            </div>
          </Card>
          <CompetitorsCard rows={summary.entities} href={`${base}/competitors?${qs}`} />
        </div>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Top sources · across the engines you track</h2>
          <div className="grid gap-6 xl:grid-cols-[1fr_1.25fr]">
            <SourceTypesCard types={sources.bySiteType} total={sources.total} />
            <DomainsCard rows={sources.domains} types={types} href={`${base}/sources?${qs}`} />
          </div>
        </section>
        <RecentChats answers={chats.answers} total={chats.total} base={base} />
      </div>
    </>
  );
}
