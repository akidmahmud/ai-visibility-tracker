import { Card } from "@/components/ui/card";
import { pct, pos, vis } from "@/lib/format";
import type { Summary } from "@/lib/types";

/** Headline numbers for the brand. Stat tiles, not charts: each is one number with its label. */
export function Kpis({ summary }: { summary: Summary }) {
  const b = summary.brand;
  if (!b || b.answers === 0) {
    return <p className="rounded-xl border bg-white p-4 text-sm text-neutral-600">No answers in this period yet. Results appear after the first run.</p>;
  }
  const dir = b.trend?.direction;
  const trend = b.trend && (dir === "up" ? `▲ ${Math.round(b.trend.delta)} vs previous period` : dir === "down" ? `▼ ${Math.round(-b.trend.delta)} vs previous period` : "steady");
  const tiles: [string, string, string?, string?][] = [
    ["Visibility", vis(b.visibility), trend ?? undefined, dir === "up" ? "text-emerald-700" : dir === "down" ? "text-red-700" : undefined],
    ["Mentioned in", pct(b.mentionRate), `of ${b.answers} AI answers`],
    ["Avg position", pos(b.avgPosition), "when mentioned"],
    ["Positive", pct(b.sentimentPct), b.sentimentPct == null ? "not assessed yet" : "of mentions"],
    ["AI answer shown", pct(b.aiResultRate), b.noAiResult ? `${b.noAiResult} searches showed none` : "on every search"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {tiles.map(([label, value, note, tone]) => (
        <Card key={label} className="px-4 py-3">
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
          {note && <dd className={`text-xs ${tone ?? "text-neutral-500"}`}>{note}</dd>}
        </Card>
      ))}
    </dl>
  );
}
