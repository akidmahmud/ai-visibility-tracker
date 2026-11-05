import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FilterBar } from "@/components/filter-bar";
import { ReportTitle } from "@/components/report-header";
import { ReportSections } from "@/components/report-sections";
import { buttonVariants } from "@/components/ui/button";
import { filterQuery, readFilters } from "@/lib/format";
import { brandStyle, loadReport, publicApi } from "@/lib/public-report";
import { loadPublicTab, seriesOrder } from "@/lib/report-data";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const LABEL: Record<string, string> = { dashboard: "Dashboard", prompts: "Prompts", competitors: "Competitors", sources: "Sources" };

export async function generateMetadata({ params }: Props) {
  const { token } = await params;
  const h = await publicApi<{ brand: { name: string } }>(encodeURIComponent(token));
  return { title: h ? `${h.brand.name} AI visibility report` : "Report not found", robots: { index: false } };
}

/** Public, read-only, agency-branded report behind a share token. Only the tabs the link allows. */
export default async function SharedReport({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const header = await loadReport(token);
  const t = encodeURIComponent(token);
  const f = readFilters(sp);
  const qs = filterQuery(f);
  const tab = typeof sp.tab === "string" && header.visibleTabs.includes(sp.tab) ? sp.tab : header.visibleTabs[0]!;
  const data = await loadPublicTab(t, tab, qs);
  if (!data) notFound();

  return (
    <div className="space-y-4" style={brandStyle(header)}>
      <ReportTitle
        header={header}
        actions={
          <a href={`/r/${t}/print?${qs}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "no-print")}>
            Download PDF
          </a>
        }
      />
      {header.visibleTabs.length > 1 && (
        <nav aria-label="Report sections" className="flex gap-1 border-b text-sm">
          {header.visibleTabs.map((v) => (
            <Link
              key={v}
              href={`/r/${t}?${filterQuery(f, { tab: v })}`}
              aria-current={v === tab ? "page" : undefined}
              className={cn("-mb-px border-b-2 px-3 py-2", v === tab ? "border-primary font-medium" : "border-transparent text-muted-foreground")}
            >
              {LABEL[v] ?? v}
            </Link>
          ))}
        </nav>
      )}
      <Suspense>
        <FilterBar />
      </Suspense>
      <ReportSections data={data} colorOrder={seriesOrder(data)} />
    </div>
  );
}
