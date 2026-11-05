import Link from "next/link";
import { Suspense } from "react";
import { SourceTypesCard } from "@/components/overview";
import { PageHeader } from "@/components/shell/app-shell";
import { SourcesExplorer, SourceTrend } from "@/components/sources-explorer";
import { api } from "@/lib/api";
import { filterQuery, readFilters } from "@/lib/format";
import type { PromptMetrics, Sources } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SourcesPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const f = readFilters(sp);
  const urls = sp.view === "urls";
  const prompt = typeof sp.prompt === "string" ? sp.prompt : undefined;
  const qs = filterQuery(f, { view: urls ? "urls" : undefined, prompt });
  const [data, metrics] = await Promise.all([api<Sources>(`/brands/${id}/sources?${qs}`), api<PromptMetrics>(`/brands/${id}/prompt-metrics?${filterQuery(f)}`)]);
  const tab = (on: boolean, view: string | undefined, label: string) => (
    <Link
      href={`/brands/${id}/sources?${filterQuery(f, { view })}`}
      aria-current={on ? "page" : undefined}
      className={cn("rounded-md px-4 py-1.5 text-sm", on ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Sources" description="The sites and pages AI answers cite. Getting onto these is how you get mentioned.">
        <nav aria-label="Group sources by" className="flex rounded-lg bg-neutral-200/70 p-1">
          {tab(!urls, undefined, "Domains")}
          {tab(urls, "urls", "URLs")}
        </nav>
      </PageHeader>
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <SourceTrend data={data} urls={urls} />
          <SourceTypesCard
            types={urls ? data.byPageType : data.bySiteType}
            total={data.total}
            title={urls ? "Content type" : "Site type"}
            subtitle={urls ? "What kind of pages get cited" : "What kind of sites get cited"}
          />
        </div>
        <Suspense>
          <SourcesExplorer
            data={data}
            urls={urls}
            prompts={metrics.prompts.map((p) => ({ id: p.id, text: p.text }))}
            exportHref={`/brands/${id}/sources/export?${qs}`}
            detailBase={`/brands/${id}/sources/url`}
          />
        </Suspense>
      </div>
    </>
  );
}
