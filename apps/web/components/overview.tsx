"use client";

import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EngineIcon, SiteIcon } from "@/components/site-icon";
import { Card, CardHeader } from "@/components/ui/card";
import { ENGINES, fmtDate, pct, pos, vis } from "@/lib/format";
import type { AnswerList, EntityRow, SourceRow } from "@/lib/types";
import { cn } from "@/lib/utils";

// categorical slots 1–5 of the validated palette; everything past slot 5 is grouped into one neutral slice
export const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const REST = "#c3c2b7";

type PagerProps = { page: number; pages: number; total: number; from: number; to: number; onPage: (p: number) => void; label: string };

export function Pager({ page, pages, total, from, to, onPage, label }: PagerProps) {
  if (pages <= 1) return <span className="text-xs text-muted-foreground">{total} total</span>;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <button aria-label={`Previous ${label}`} disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30">
        <ChevronLeft className="size-4" />
      </button>
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <button aria-label={`Next ${label}`} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} className="rounded p-1 hover:bg-neutral-100 disabled:opacity-30">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function usePages<T>(rows: T[], size: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, pages - 1);
  return {
    rows: rows.slice(p * size, p * size + size),
    pager: { page: p, pages, total: rows.length, from: rows.length ? p * size + 1 : 0, to: Math.min(rows.length, p * size + size), onPage: setPage },
    offset: p * size,
  };
}

/** Markdown markers out of a one-line preview. */
const plain = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#`>]+/g, "").replace(/\s+/g, " ").trim();

export const YouBadge = () => <span className="rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand">You</span>;

export function CompetitorsCard({ rows, href }: { rows: EntityRow[]; href: string }) {
  const { rows: page, pager, offset } = usePages(rows, 8);
  const max = Math.max(1, ...rows.map((r) => r.visibility ?? 0));
  return (
    <Card className="flex flex-col">
      <CardHeader title={<Link href={href} className="hover:underline">Competitors</Link>} subtitle="Companies AI answers name most, by visibility">
        <Pager {...pager} label="competitors" />
      </CardHeader>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No companies named in this period.</p>
      ) : (
        <table className="mt-2 w-full table-fixed text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr className="border-b">
              <th className="w-10 py-2 pl-4 text-left font-medium">#</th>
              <th className="py-2 text-left font-medium">Brand</th>
              <th className="w-32 py-2 text-right font-medium">Visibility</th>
              <th className="w-24 py-2 text-right font-medium" title="Share of mentions that were positive">Sentiment</th>
              <th className="w-20 py-2 pr-4 text-right font-medium" title="Average rank when mentioned (1 = first)">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {page.map((e, i) => (
              <tr key={e.entityId} className={cn(e.kind === "SELF" && "bg-amber-50/70")}>
                <td className="py-2.5 pl-4 tabular-nums text-muted-foreground">{offset + i + 1}</td>
                <td className="py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <SiteIcon domain={e.domain} name={e.name} size={18} />
                    <span className={cn("truncate", e.kind === "SELF" && "font-semibold")}>{e.name}</span>
                    {e.kind === "SELF" && <YouBadge />}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-neutral-100 sm:block">
                      <span className="block h-full rounded-full" style={{ width: `${((e.visibility ?? 0) / max) * 100}%`, background: e.kind === "SELF" ? "#eda100" : "#9aa3b2" }} />
                    </span>
                    <span className="w-8 tabular-nums">{vis(e.visibility)}</span>
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums">{pct(e.sentimentPct)}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{pos(e.avgPosition)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function SourceTypesCard({
  types,
  total,
  title = "Source types",
  subtitle = "What kind of sites the AI answers cite",
}: {
  types: { type: string; count: number }[];
  total: number;
  title?: string;
  subtitle?: string;
}) {
  const sorted = [...types].sort((a, b) => b.count - a.count);
  const slices = sorted.slice(0, 5).map((t, i) => ({ ...t, color: SLOTS[i]! }));
  const rest = sorted.slice(5).reduce((s, t) => s + t.count, 0);
  if (rest) slices.push({ type: "Smaller types", count: rest, color: REST });
  const sum = slices.reduce((s, t) => s + t.count, 0) || 1;
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {total === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No citations in this period.</p>
      ) : (
        <div className="grid items-center gap-6 p-4 sm:grid-cols-[176px_1fr]">
          <div className="relative mx-auto size-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="count" nameKey="type" innerRadius="72%" outerRadius="100%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                  {slices.map((s) => (
                    <Cell key={s.type} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} citations`, String(n)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <p className="text-2xl font-semibold tabular-nums">{total.toLocaleString("en-US")}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Citations</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {slices.map((s) => (
              <li key={s.type} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.type}</span>
                <span className="tabular-nums text-muted-foreground">{Math.round((s.count / sum) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

const TYPE_TINT = ["bg-blue-50 text-blue-700", "bg-orange-50 text-orange-700", "bg-emerald-50 text-emerald-700", "bg-amber-50 text-amber-800", "bg-pink-50 text-pink-700"];

export function DomainsCard({ rows, types, href }: { rows: SourceRow[]; types: string[]; href: string }) {
  const { rows: page, pager } = usePages(rows, 6);
  const tint = (t: string) => TYPE_TINT[types.indexOf(t)] ?? "bg-neutral-100 text-neutral-700";
  return (
    <Card className="flex flex-col">
      <CardHeader title={<Link href={href} className="hover:underline">Top domains</Link>} subtitle="Sites the AI answers cite most">
        <Pager {...pager} label="domains" />
      </CardHeader>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No citations in this period.</p>
      ) : (
        <table className="mt-2 w-full table-fixed text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pl-4 text-left font-medium">Domain</th>
              <th className="w-16 py-2 text-right font-medium" title="Share of all citations">Used</th>
              <th className="w-16 py-2 text-right font-medium">Cites</th>
              <th className="w-44 py-2 pr-4 text-right font-medium">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {page.map((d) => (
              <tr key={d.domain}>
                <td className="py-2.5 pl-4">
                  <span className="flex min-w-0 items-center gap-2">
                    <SiteIcon domain={d.domain} name={d.domain} size={16} />
                    <span className="truncate">{d.domain}</span>
                    {d.owner === "SELF" && <YouBadge />}
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums">{pct(d.share)}</td>
                <td className="py-2.5 text-right tabular-nums">{d.count}</td>
                <td className="py-2.5 pr-4 text-right">
                  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", tint(d.siteType))}>{d.siteType}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function RecentChats({ answers, total, base }: { answers: AnswerList["answers"]; total: number; base: string }) {
  const [mentioned, setMentioned] = useState(false);
  const list = mentioned ? answers.filter((a) => a.selfRank != null) : answers;
  const { rows, pager } = usePages(list, 10);
  return (
    <Card>
      <CardHeader title={<span>Recent chats <span className="font-normal text-muted-foreground">({total})</span></span>} subtitle="The latest answers, newest first">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span id="mentioned-label">Brand mentioned</span>
            <button
              type="button"
              role="switch"
              aria-checked={mentioned}
              aria-labelledby="mentioned-label"
              onClick={() => setMentioned(!mentioned)}
              className={cn("relative h-5 w-9 rounded-full transition-colors", mentioned ? "bg-brand" : "bg-neutral-200")}
            >
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", mentioned ? "left-[18px]" : "left-0.5")} />
            </button>
          </span>
          <Pager {...pager} label="chats" />
        </div>
      </CardHeader>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{mentioned ? "No answers mentioned you yet." : "No chats in this period."}</p>
      ) : (
        <ul className="grid gap-3 p-4 md:grid-cols-2">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`${base}/chats/${a.id}`} className="flex h-full gap-3 rounded-lg border p-3 transition-colors hover:border-brand/40 hover:bg-neutral-50">
                <EngineIcon model={a.model} size={22} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-neutral-800">{ENGINES[a.model] ?? a.model}</span>
                    {fmtDate(a.capturedAt)}
                    <span className={cn("ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold", a.selfRank ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500")}>
                      {a.status === "FAILED" ? "Capture failed" : a.status === "NO_AI_RESULT" ? "No AI answer" : a.selfRank ? `You: #${a.selfRank}` : "Not mentioned"}
                    </span>
                  </p>
                  <p className="mt-1 line-clamp-1 text-sm font-medium">{a.prompt}</p>
                  {a.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{plain(a.excerpt)}</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Dismissible pointer to the MCP setup; remembered per browser. */
export function McpBanner({ href }: { href: string }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("mcp-banner") === "hidden");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden) return null;
  return (
    <Card className="no-print mb-6 flex flex-wrap items-center gap-3 p-3 pl-4">
      <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Talk to your data from Claude, Cursor or ChatGPT <span className="ml-1 rounded bg-brand-soft px-1.5 py-px text-[10px] font-semibold uppercase text-brand">New</span>
        </p>
        <p className="text-xs text-muted-foreground">Connect the MCP server and ask how your brand is trending, no dashboards needed.</p>
      </div>
      <Link href={href} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90">
        Set it up
      </Link>
      <button
        aria-label="Dismiss"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem("mcp-banner", "hidden");
          } catch {
            // private mode: the banner just comes back next visit
          }
        }}
        className="rounded p-1 text-muted-foreground hover:bg-neutral-100"
      >
        <X className="size-4" />
      </button>
    </Card>
  );
}
