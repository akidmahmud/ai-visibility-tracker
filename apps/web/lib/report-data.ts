import type { ReportData } from "@/components/report-sections";
import { publicApi } from "./public-report";
import type { Heatmap, PromptMetrics, SourceRow, Sources, Summary, Timeseries } from "./types";

/** Loads one public report tab as report sections. null = tab not shared / link gone. */
export async function loadPublicTab(token: string, tab: string, qs: string): Promise<ReportData | null> {
  if (tab === "dashboard") {
    const d = await publicApi<{ summary: Summary; timeseries: Timeseries; topSources: SourceRow[] }>(`${token}/dashboard?${qs}`);
    return d && { kpis: d.summary, timeseries: d.timeseries, competitors: d.summary.entities.slice(0, 10), sources: { total: d.topSources.reduce((s, x) => s + x.count, 0), domains: d.topSources, bySiteType: [], byPageType: [], trend: [], view: "domains", searchTotal: 0 } };
  }
  if (tab === "competitors") {
    const d = await publicApi<{ summary: Summary; heatmap: Heatmap }>(`${token}/competitors?${qs}`);
    return d && { competitors: d.summary.entities, heatmap: d.heatmap };
  }
  if (tab === "prompts") {
    const d = await publicApi<PromptMetrics>(`${token}/prompts?${qs}`);
    return d && { prompts: d };
  }
  const d = await publicApi<Sources>(`${token}/sources?${qs}`);
  return d && { sources: d };
}

/** Color order for the trend chart: the series as the API ranked them. */
export const seriesOrder = (data: ReportData) => data.timeseries?.series.map((s) => s.entityId) ?? [];
