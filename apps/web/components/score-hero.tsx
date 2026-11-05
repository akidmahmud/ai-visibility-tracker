import { EngineIcon } from "@/components/site-icon";
import { ENGINES, pct, pos, vis } from "@/lib/format";
import type { Heatmap, Summary } from "@/lib/types";

/** 270° dial: the brand's visibility score as a single reading. */
function Dial({ value }: { value: number | null }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <svg viewBox="0 0 128 128" className="size-40 shrink-0" role="img" aria-label={`Visibility ${vis(value)} out of 100`}>
      <g transform="rotate(135 64 64)">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--signal)" strokeWidth="10" strokeDasharray={`${(arc * v) / 100} ${c}`} strokeLinecap="round" />
      </g>
      <text x="64" y="66" textAnchor="middle" className="fill-white font-mono text-[34px] font-semibold">{vis(value)}</text>
      <text x="64" y="86" textAnchor="middle" className="fill-slate-400 font-mono text-[8px] uppercase tracking-[0.2em]">of 100</text>
    </svg>
  );
}

/** Overview headline: the visibility dial, where the brand ranks, and how each engine sees it. */
export function ScoreHero({ summary, heatmap, brand }: { summary: Summary; heatmap: Heatmap; brand: string }) {
  const b = summary.brand;
  if (!b || b.answers === 0) {
    return <p className="rounded-xl border bg-white p-4 text-sm text-neutral-600">No answers in this period yet. Results appear after the first run.</p>;
  }
  const rank = summary.entities.findIndex((e) => e.kind === "SELF") + 1;
  const self = heatmap.rows.find((r) => r.kind === "SELF");
  const engines = heatmap.models.map((m) => ({ model: m, v: self?.cells.find((c) => c.model === m)?.visibility ?? null }));
  const dir = b.trend?.direction;
  const stats: [string, string, string][] = [
    ["Mentioned in", pct(b.mentionRate), `of ${b.answers} answers`],
    ["Avg position", pos(b.avgPosition), "when named"],
    ["Positive", pct(b.sentimentPct), "of mentions"],
    ["AI answer shown", pct(b.aiResultRate), b.noAiResult ? `${b.noAiResult} searches had none` : "every search"],
  ];

  return (
    <section className="grid overflow-hidden rounded-2xl bg-ink text-white lg:grid-cols-[auto_1fr_1.1fr]">
      <div className="flex items-center gap-5 p-6">
        <Dial value={b.visibility} />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-signal">Visibility score</p>
          <p className="mt-1 text-2xl font-bold leading-tight">
            {rank > 0 ? (
              <>
                #{rank} <span className="text-base font-medium text-slate-400">of {summary.entities.length}</span>
              </>
            ) : (
              "Not ranked"
            )}
          </p>
          <p className="text-sm text-slate-400">companies AI names for these prompts</p>
          {b.trend && (
            <p className={`mt-3 inline-flex rounded-full px-2 py-0.5 font-mono text-xs ${dir === "up" ? "bg-emerald-400/15 text-emerald-300" : dir === "down" ? "bg-red-400/15 text-red-300" : "bg-white/10 text-slate-300"}`}>
              {dir === "up" ? `▲ +${Math.round(b.trend.delta)}` : dir === "down" ? `▼ ${Math.round(b.trend.delta)}` : "● steady"} vs previous period
            </p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-white/10 bg-white/10 lg:border-x">
        {stats.map(([l, v, note]) => (
          <div key={l} className="bg-ink px-5 py-4">
            <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">{l}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
            <dd className="text-xs text-slate-500">{note}</dd>
          </div>
        ))}
      </dl>

      <div className="p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">How each engine sees {brand}</p>
        <ul className="mt-3 space-y-2.5">
          {engines.map((e) => (
            <li key={e.model} className="grid grid-cols-[18px_88px_1fr_36px] items-center gap-2.5 text-sm">
              <span className="rounded bg-white p-px">
                <EngineIcon model={e.model} size={16} />
              </span>
              <span className="truncate text-slate-300">{ENGINES[e.model] ?? e.model}</span>
              <span className="h-2 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-signal" style={{ width: `${Math.max(0, Math.min(100, e.v ?? 0))}%`, opacity: e.v == null ? 0 : 1 }} />
              </span>
              <span className="text-right tabular-nums text-slate-200">{vis(e.v)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
