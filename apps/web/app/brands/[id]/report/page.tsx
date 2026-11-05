import { AutoPrint } from "@/components/print-button";
import { ReportSections } from "@/components/report-sections";
import { api } from "@/lib/api";
import { colorOrder, getBrand, getCompetitors } from "@/lib/brand";
import { filterQuery, fmtDate, readFilters } from "@/lib/format";
import type { Heatmap, PromptMetrics, Sources, Summary, Timeseries } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Full brand report for print/PDF with the current filters. */
export default async function BrandReport({ params, searchParams }: Props) {
  const { id } = await params;
  const f = readFilters(await searchParams);
  const qs = filterQuery(f);
  const [brand, competitors, summary, timeseries, heatmap, prompts, sources] = await Promise.all([
    getBrand(id),
    getCompetitors(id),
    api<Summary>(`/brands/${id}/summary?${qs}`),
    api<Timeseries>(`/brands/${id}/timeseries?${qs}`),
    api<Heatmap>(`/brands/${id}/competitors/heatmap?${qs}`),
    api<PromptMetrics>(`/brands/${id}/prompt-metrics?${qs}`),
    api<Sources>(`/brands/${id}/sources?${qs}`),
  ]);
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {brand.name} · last {f.days} days · generated {fmtDate(new Date())}
      </p>
      <ReportSections data={{ kpis: summary, timeseries, competitors: summary.entities.slice(0, 15), heatmap, prompts, sources }} colorOrder={colorOrder(brand, competitors)} />
      <AutoPrint />
    </div>
  );
}
