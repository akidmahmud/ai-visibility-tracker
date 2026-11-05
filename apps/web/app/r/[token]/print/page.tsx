import { AutoPrint } from "@/components/print-button";
import { ReportTitle } from "@/components/report-header";
import { ReportSections } from "@/components/report-sections";
import { filterQuery, fmtDate, readFilters } from "@/lib/format";
import { brandStyle, loadReport, publicApi } from "@/lib/public-report";
import { loadPublicTab, seriesOrder } from "@/lib/report-data";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const h = await publicApi<{ brand: { name: string } }>(encodeURIComponent(token));
  return { title: h ? `${h.brand.name} AI visibility report` : "AI visibility report" };
}

/** Print layout of a shared report: every shared tab on one page; the print dialog saves it as PDF. */
export default async function PrintReport({ params, searchParams }: Props) {
  const { token } = await params;
  const header = await loadReport(token);
  const t = encodeURIComponent(token);
  const f = readFilters(await searchParams);
  const qs = filterQuery(f);
  const tabs = await Promise.all(header.visibleTabs.map((tab) => loadPublicTab(t, tab, qs)));
  const merged = Object.assign({}, ...tabs.filter(Boolean));

  return (
    <div className="space-y-6" style={brandStyle(header)}>
      <ReportTitle header={header} />
      <p className="text-xs text-muted-foreground">Last {f.days} days · generated {fmtDate(new Date())}</p>
      <ReportSections data={merged} colorOrder={seriesOrder(merged)} />
      <AutoPrint />
    </div>
  );
}
