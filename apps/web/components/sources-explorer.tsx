"use client";

import { Download, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pager, SLOTS, usePages, YouBadge } from "@/components/overview";
import { EngineIcon, SiteIcon } from "@/components/site-icon";
import { Card, CardHeader } from "@/components/ui/card";
import { ENGINES, fmtDate, pct } from "@/lib/format";
import type { SourceRow, Sources } from "@/lib/types";
import { cn } from "@/lib/utils";

const INK = { muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7" };
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const short = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "");

/** Citations per day for the five most-cited sites or pages. */
export function SourceTrend({ data, urls }: { data: Sources; urls: boolean }) {
  const keys = data.domains.slice(0, 5).map((d) => d.url ?? d.domain);
  const days = [...new Set(data.trend.map((t) => t.day))].sort();
  const rows = days.map((day) => ({ day, ...Object.fromEntries(keys.map((k) => [k, data.trend.find((t) => t.day === day && t.key === k)?.count ?? 0])) }));
  return (
    <Card className="flex flex-col">
      <CardHeader title={`Source usage by ${urls ? "URL" : "domain"}`} subtitle={`Top ${Math.min(5, keys.length)} of ${data.domains.length} ${urls ? "URLs" : "domains"}, citations per day`} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs">
        {keys.map((k, i) => (
          <li key={k} className="flex min-w-0 max-w-64 items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: SLOTS[i] }} />
            <span className="truncate text-neutral-600" title={k}>{short(k)}</span>
          </li>
        ))}
      </ul>
      <div className="h-56 p-4 pt-2">
        {days.length < 2 ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">Not enough history to plot a trend yet: it appears after the next run.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }} tickLine={false} />
              <YAxis allowDecimals={false} stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip labelFormatter={(d) => shortDay(String(d))} formatter={(v, k) => [v, short(String(k))]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              {keys.map((k, i) => (
                <Line key={k} dataKey={k} stroke={SLOTS[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

const TYPE_TINT = ["bg-blue-50 text-blue-700", "bg-orange-50 text-orange-700", "bg-emerald-50 text-emerald-700", "bg-amber-50 text-amber-800", "bg-pink-50 text-pink-700"];
const select = "h-9 rounded-lg border bg-white px-2.5 text-sm";

/** Filterable, searchable table of cited sites or pages. Domain/type/search filter in the browser; prompt goes to the server. */
export function SourcesExplorer({ data, urls, prompts, exportHref, detailBase }: { data: Sources; urls: boolean; prompts: { id: string; text: string }[]; exportHref: string; detailBase: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [domain, setDomain] = useState(params.get("domain") ?? "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<"" | "ai" | "search">("");
  const typeKey = (r: SourceRow) => (urls ? r.pageType : r.siteType) ?? "Other";
  const types = (urls ? data.byPageType : data.bySiteType).map((t) => t.type);
  const domains = [...new Set(data.domains.map((d) => d.domain))].sort();
  const needle = q.trim().toLowerCase();
  const rows = data.domains.filter(
    (r) =>
      (!domain || r.domain === domain) &&
      (!type || typeKey(r) === type) &&
      (!origin || (origin === "ai" ? r.count > r.searchCount : r.searchCount > 0)) && (!needle || `${r.url ?? ""} ${r.title ?? ""} ${r.domain}`.toLowerCase().includes(needle)),
  );
  const { rows: page, pager } = usePages(rows, 15);
  const setPrompt = (id: string) => {
    const p = new URLSearchParams(params);
    if (id) p.set("prompt", id);
    else p.delete("prompt");
    router.replace(`${pathname}?${p}`, { scroll: false });
  };
  const engines = (r: SourceRow) => Object.keys(r.byModel).sort();

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {urls && (
          <select aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)} className={cn(select, "max-w-52")}>
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
        <select aria-label="Prompt" value={params.get("prompt") ?? ""} onChange={(e) => setPrompt(e.target.value)} className={cn(select, "max-w-64")}>
          <option value="">All prompts</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>{p.text}</option>
          ))}
        </select>
        <select aria-label={urls ? "Page type" : "Site type"} value={type} onChange={(e) => setType(e.target.value)} className={select}>
          <option value="">{urls ? "All page types" : "All site types"}</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {data.searchTotal > 0 && (
          <select aria-label="Where it appeared" value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} className={select}>
            <option value="">AI citations + Google results</option>
            <option value="ai">Cited by AI only</option>
            <option value="search">Google search results</option>
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <a href={exportHref} className="flex h-9 items-center gap-1.5 rounded-lg border bg-white px-3 text-sm hover:bg-neutral-50">
            <Download className="size-4" /> Export
          </a>
          <label className="relative">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-48 rounded-lg border bg-white pl-8 pr-2 text-sm" />
          </label>
          <Pager {...pager} label={urls ? "URLs" : "domains"} />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No sources match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr className="border-b">
                <th className="py-2.5 pl-4 text-left font-medium">{urls ? "URL / page title" : "Domain"}</th>
                <th className="w-36 py-2.5 text-center font-medium">{urls ? "Page type" : "Site type"}</th>
                <th className="w-32 py-2.5 text-center font-medium">AI engines</th>
                <th className="w-20 py-2.5 text-right font-medium">Citations</th>
                <th className="w-20 py-2.5 text-right font-medium" title="AI answers that cited it">Answers</th>
                <th className="w-16 py-2.5 text-right font-medium">Share</th>
                <th className="w-28 py-2.5 text-right font-medium">Last seen</th>
                <th className="w-20 py-2.5 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.map((r) => {
                const key = r.url ?? r.domain;
                const t = typeKey(r);
                const tint = TYPE_TINT[types.indexOf(t)] ?? "bg-neutral-100 text-neutral-700";
                return (
                  <tr key={key} className="hover:bg-muted/60">
                    <td className="py-2.5 pl-4">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <SiteIcon domain={r.domain} name={r.domain} size={16} className="mt-0.5" />
                        <div className="min-w-0">
                          <a href={r.url ?? `https://${r.domain}`} target="_blank" rel="noopener noreferrer" className="block truncate hover:underline" title={key}>
                            {r.url ? short(r.url) : r.domain}
                          </a>
                          {r.title && <p className="truncate text-xs text-muted-foreground">{r.title}</p>}
                        </div>
                        {r.owner === "SELF" && <YouBadge />}
                        {r.owner === "COMPETITOR" && <span className="rounded-full bg-orange-50 px-1.5 py-px text-[10px] font-semibold text-orange-700">Rival</span>}
                        {r.searchCount > 0 && (
                          <span
                            title={r.searchCount === r.count ? "Shown in Google's search results next to the AI Overview; the AI didn't cite it" : `${r.searchCount} of ${r.count} from Google's search results`}
                            className="whitespace-nowrap rounded-full bg-neutral-100 px-1.5 py-px text-[10px] font-semibold text-neutral-600"
                          >
                            {r.searchCount === r.count ? "Google search result" : "+ Google result"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", tint)}>{t}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="flex justify-center gap-1">
                        {engines(r).map((m) => (
                          <span key={m} title={`${ENGINES[m] ?? m}: ${r.byModel[m]}`}>
                            <EngineIcon model={m} size={15} />
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{r.count}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.answers}</td>
                    <td className="py-2.5 text-right tabular-nums">{pct(r.share)}</td>
                    <td className="py-2.5 text-right text-xs text-muted-foreground">{fmtDate(`${r.lastSeen}T12:00:00Z`)}</td>
                    <td className="py-2.5 pr-4 text-right">
                      {r.url ? (
                        <Link href={`${detailBase}?url=${encodeURIComponent(r.url)}`} className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50">View</Link>
                      ) : (
                        <Link href={`${pathname}?view=urls&domain=${encodeURIComponent(r.domain)}`} className="rounded-md border px-2 py-1 text-xs hover:bg-neutral-50">Pages</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

