"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ENGINES } from "@/lib/format";
import type { Timeseries } from "@/lib/types";

// Categorical slots 1–5 of the reference palette (validated: lightness, chroma, CVD ΔE ≥ 9.1, normal ΔE ≥ 19.6).
// Slots 3–5 are under 3:1 on white, so the chart always ships with the table beside it.
const SLOTS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const INK = { muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7", primary: "#0b0b0b" };

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Visibility over time, you vs. top rivals. `colorOrder` fixes each entity's color (you first, then tracked
 * competitors in the order they were added) so a filter never repaints a series.
 */
export function VisibilityChart({ data, colorOrder, bare = false }: { data: Timeseries; colorOrder: string[]; bare?: boolean }) {
  const baseline = new Map((data.peekaboo ?? []).map((b) => [b.day, Math.round(b.score)]));
  const days = [...new Set([...data.days, ...baseline.keys()])].sort();
  if (days.length === 0) return <p className="text-sm text-neutral-500">No data in this period.</p>;
  // fixed-order entities keep their slot; the rest (untracked rivals) take the free slots in series order
  const colors = new Map<string, string>();
  for (const s of data.series) {
    const i = colorOrder.indexOf(s.entityId);
    if (i >= 0 && i < SLOTS.length) colors.set(s.entityId, SLOTS[i]!);
  }
  const unused = SLOTS.filter((c) => ![...colors.values()].includes(c));
  for (const s of data.series) if (!colors.has(s.entityId)) colors.set(s.entityId, unused.shift() ?? SLOTS.at(-1)!);
  const colorOf = (id: string) => colors.get(id)!;
  const rows = days.map((day) => ({
    day,
    ...Object.fromEntries(
      data.series.map((s) => {
        const v = s.points.find((p) => p.day === day)?.visibility;
        return [s.entityId, v == null ? null : Math.round(v)];
      }),
    ),
    peekaboo: baseline.get(day) ?? null,
  }));
  const single = data.days.length === 1;
  const nameOf = (id: string) => (id === "peekaboo" ? "Peekaboo's score (their method)" : (data.series.find((s) => s.entityId === id)?.name ?? id));

  return (
    <figure className={bare ? "" : "rounded-xl border bg-card p-4"}>
      {!bare && <figcaption className="mb-2 text-sm font-medium">Visibility over time</figcaption>}
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {data.series.map((s) => (
          <li key={s.entityId} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: colorOf(s.entityId) }} />
            <span className={s.kind === "SELF" ? "font-medium" : "text-neutral-600"}>{s.name}{s.kind === "SELF" ? " (You)" : ""}</span>
          </li>
        ))}
        {baseline.size > 0 && (
          <li className="flex items-center gap-1.5 text-neutral-600">
            <span aria-hidden className="w-3 border-t-2 border-dashed" style={{ borderColor: INK.muted }} /> Peekaboo&apos;s score
          </li>
        )}
      </ul>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={INK.grid} vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} stroke={INK.axis} tick={{ fill: INK.muted, fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ stroke: INK.axis }}
              labelFormatter={(d) => shortDay(String(d))}
              formatter={(v, id) => [v ?? "–", nameOf(String(id))]}
              contentStyle={{ borderRadius: 8, borderColor: INK.grid, fontSize: 12, color: INK.primary }}
            />
            {data.providerChanges.map((c) => (
              <ReferenceLine
                key={`${c.day}-${c.model}`}
                x={c.day}
                stroke={INK.muted}
                strokeDasharray="3 3"
                label={{ value: `${ENGINES[c.model] ?? c.model} provider changed`, fill: INK.muted, fontSize: 11, position: "insideTopLeft" }}
              />
            ))}
            {baseline.size > 0 && (
              <Line dataKey="peekaboo" name="peekaboo" stroke={INK.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            )}
            {data.series.map((s) => (
              <Line
                key={s.entityId}
                dataKey={s.entityId}
                name={s.entityId}
                stroke={colorOf(s.entityId)}
                strokeWidth={s.kind === "SELF" ? 2.5 : 2}
                dot={single ? { r: 5, strokeWidth: 2, stroke: "#fcfcfb", fill: colorOf(s.entityId) } : false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fcfcfb", fill: colorOf(s.entityId) }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        0–100: 100 means named first in every answer. Exact values are in the table below.
        {single && " The trend line appears after the next run."}
      </p>
    </figure>
  );
}
