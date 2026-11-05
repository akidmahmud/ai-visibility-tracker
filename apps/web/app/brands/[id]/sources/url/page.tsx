import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EngineIcon, SiteIcon } from "@/components/site-icon";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ENGINES, filterQuery, fmtDate, readFilters } from "@/lib/format";

type Detail = {
  url: string;
  title: string | null;
  domain: string | null;
  pageType: string;
  citations: { answerId: string; model: string; capturedAt: string; prompt: { id: string; text: string }; position: number; searchResult: boolean }[];
};
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** One cited page: which prompts and engines cite it, and at which position. */
export default async function SourceUrlPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const url = typeof sp.url === "string" ? sp.url : null;
  if (!url) notFound();
  const f = readFilters(sp);
  const d = await api<Detail>(`/brands/${id}/sources/url?${filterQuery(f, { url })}`);
  const prompts = new Set(d.citations.map((c) => c.prompt.id)).size;
  const engines = [...new Set(d.citations.map((c) => c.model))];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/brands/${id}/sources?${filterQuery(f, { view: "urls" })}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All URLs
        </Link>
        <div className="mt-2 flex items-start gap-3">
          <SiteIcon domain={d.domain} name={d.domain ?? url} size={32} />
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">{d.title ?? url}</h1>
            <a href={url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 break-all text-sm text-brand hover:underline">
              {url} <ExternalLink className="size-3.5 shrink-0" />
            </a>
          </div>
        </div>
      </div>
      <dl className="grid gap-4 sm:grid-cols-4">
        {(
          [
            ["Page type", d.pageType],
            ["Citations", String(d.citations.length)],
            ["Prompts citing it", String(prompts)],
            ["Engines", engines.map((m) => ENGINES[m] ?? m).join(", ") || "–"],
          ] as const
        ).map(([l, v]) => (
          <Card key={l} className="px-4 py-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{l}</dt>
            <dd className="mt-1 text-lg font-semibold">{v}</dd>
          </Card>
        ))}
      </dl>
      {d.citations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No answers cited this page in the selected period.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prompt</TableHead>
              <TableHead>Engine</TableHead>
              <TableHead numeric>Position</TableHead>
              <TableHead>Date</TableHead>
              <TableHead><span className="sr-only">Answer</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.citations.map((c) => (
              <TableRow key={`${c.answerId}-${c.position}`}>
                <TableCell className="max-w-md">{c.prompt.text}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <EngineIcon model={c.model} size={16} /> {ENGINES[c.model] ?? c.model}
                  </span>
                </TableCell>
                <TableCell numeric>
                  {c.searchResult ? <span className="text-xs text-muted-foreground">Google result</span> : c.position}
                </TableCell>
                <TableCell>{fmtDate(c.capturedAt)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/brands/${id}/chats/${c.answerId}`} className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50">Open answer</Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
