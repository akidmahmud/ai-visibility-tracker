import { Kpis } from "@/components/kpis";
import { EntityTable, HeatmapTable, MatrixTable, SiteTypeBars, SourcesTable } from "@/components/tables";
import { VisibilityChart } from "@/components/visibility-chart";
import type { EntityRow, Heatmap, PromptMetrics, Sources, Summary, Timeseries } from "@/lib/types";

export type ReportData = {
  kpis?: Summary;
  timeseries?: Timeseries;
  competitors?: EntityRow[];
  heatmap?: Heatmap;
  prompts?: PromptMetrics;
  sources?: Sources;
};

/** The report sections that were given, stacked; used on share pages and for print/PDF. */
export function ReportSections({ data, colorOrder }: { data: ReportData; colorOrder: string[] }) {
  const h = "font-semibold";
  return (
    <div className="space-y-8">
      {data.kpis && <Kpis summary={data.kpis} />}
      {data.timeseries && <VisibilityChart data={data.timeseries} colorOrder={colorOrder} />}
      {data.competitors && (
        <section className="break-inside-avoid space-y-2">
          <h2 className={h}>Competitors</h2>
          <EntityTable rows={data.competitors} />
        </section>
      )}
      {data.heatmap && (
        <section className="break-inside-avoid space-y-2">
          <h2 className={h}>By AI engine</h2>
          <HeatmapTable data={data.heatmap} />
        </section>
      )}
      {data.prompts && (
        <section className="space-y-2">
          <h2 className={h}>By prompt</h2>
          <MatrixTable data={data.prompts} />
        </section>
      )}
      {data.sources && (
        <section className="space-y-2">
          <h2 className={h}>Where AI gets its answers</h2>
          <SiteTypeBars data={data.sources.bySiteType} total={data.sources.total} />
          <SourcesTable rows={data.sources.domains.slice(0, 25)} models={[]} />
        </section>
      )}
    </div>
  );
}
