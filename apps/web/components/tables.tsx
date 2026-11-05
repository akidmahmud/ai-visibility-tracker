import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ENGINES, KIND_LABEL, OWNER_LABEL, pct, pos, vis } from "@/lib/format";
import type { EntityRow, Heatmap, PromptMetrics, SourceRow } from "@/lib/types";

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export function KindTag({ kind }: { kind: keyof typeof KIND_LABEL }) {
  return (
    <Badge variant={kind === "SELF" ? "default" : "outline"} className="ml-1.5 align-middle">
      {KIND_LABEL[kind]}
    </Badge>
  );
}

/** Leaderboard: every company the answers named, ranked by visibility. `action` adds a per-row control. */
export function EntityTable({ rows, action }: { rows: EntityRow[]; action?: (row: EntityRow) => React.ReactNode }) {
  if (!rows.length) return <Empty>No companies named in this period.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          <TableHead numeric>Visibility</TableHead>
          <TableHead numeric>Mentioned in</TableHead>
          <TableHead numeric>Avg position</TableHead>
          <TableHead numeric>Share of voice</TableHead>
          <TableHead numeric>Positive</TableHead>
          {action && <TableHead><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((e) => (
          <TableRow key={e.entityId} className={e.kind === "SELF" ? "bg-muted font-medium" : undefined}>
            <TableCell>
              {e.name}
              <KindTag kind={e.kind} />
              {e.domain && <span className="block text-xs font-normal text-muted-foreground">{e.domain}</span>}
            </TableCell>
            <TableCell numeric>{vis(e.visibility)}</TableCell>
            <TableCell numeric>{pct(e.mentionRate)}</TableCell>
            <TableCell numeric>{pos(e.avgPosition)}</TableCell>
            <TableCell numeric>{pct(e.shareOfVoice)}</TableCell>
            <TableCell numeric>{pct(e.sentimentPct)}</TableCell>
            {action && <TableCell className="text-right">{action(e)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Sequential single-hue ramp (reference blue, steps 100–650); ink flips to white from step 450.
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
function cell(v: number | null) {
  if (v == null) return { background: "transparent", color: "#898781" };
  const i = Math.min(RAMP.length - 1, Math.floor((v / 100) * RAMP.length));
  return { background: RAMP[i], color: i >= 3 ? "#ffffff" : "#0b0b0b" };
}
const Cell = ({ v }: { v: number | null }) => (
  <td className="p-1">
    <div className="rounded py-2 text-center tabular-nums" style={cell(v)}>{vis(v)}</div>
  </td>
);

/** Company × engine visibility. The number is always printed in the cell, so color is never the only cue. */
export function HeatmapTable({ data }: { data: Heatmap }) {
  if (!data.rows.length) return <Empty>No data in this period.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Company</TableHead>
          {data.models.map((m) => <TableHead key={m} className="text-center">{ENGINES[m] ?? m}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((r) => (
          <TableRow key={r.entityId}>
            <TableCell className={r.kind === "SELF" ? "font-medium" : undefined}>
              {r.name}
              <KindTag kind={r.kind} />
            </TableCell>
            {r.cells.map((c) => <Cell key={c.model} v={c.visibility} />)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Prompt × the brand and its top rivals: who wins each question. */
export function MatrixTable({ data, href }: { data: PromptMetrics; href?: (promptId: string) => string }) {
  const rows = data.prompts.filter((p) => p.answers > 0);
  if (!rows.length || !data.columns.length) return <Empty>No answers in this period.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Prompt</TableHead>
          {data.columns.map((c) => (
            <TableHead key={c.entityId} className="text-center">
              {c.name}
              {c.kind === "SELF" && <KindTag kind="SELF" />}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="max-w-md">{href ? <a href={href(p.id)} className="hover:underline">{p.text}</a> : p.text}</TableCell>
            {p.matrix.map((v, i) => <Cell key={data.columns[i]!.entityId} v={v} />)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Cited sites (or pages) with owner, site type and per-engine counts. */
export function SourcesTable({ rows, models }: { rows: SourceRow[]; models: string[] }) {
  if (!rows.length) return <Empty>No sources cited in this period.</Empty>;
  const pages = rows.some((r) => r.url);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{pages ? "Page" : "Site"}</TableHead>
          <TableHead>Type</TableHead>
          <TableHead numeric>Citations</TableHead>
          <TableHead numeric>Share</TableHead>
          {models.map((m) => <TableHead key={m} numeric>{ENGINES[m] ?? m}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((d) => (
          <TableRow key={d.url ?? d.domain}>
            <TableCell className="max-w-md break-words">
              {d.url ? (
                <>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{d.title || d.url}</a>
                  <span className="block text-xs text-muted-foreground">{d.domain}</span>
                </>
              ) : (
                d.domain
              )}
              {d.owner !== "THIRD_PARTY" && <Badge variant="outline" className="ml-1.5">{OWNER_LABEL[d.owner]}</Badge>}
            </TableCell>
            <TableCell className="text-muted-foreground">{d.siteType}</TableCell>
            <TableCell numeric>{d.count}</TableCell>
            <TableCell numeric>{pct(d.share)}</TableCell>
            {models.map((m) => <TableCell key={m} numeric>{d.byModel[m] ?? 0}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Site-type breakdown as a ranked bar list (a donut would hide the small slices). */
export function SiteTypeBars({ data, total }: { data: { type: string; count: number }[]; total: number }) {
  if (!total) return null;
  return (
    <Card className="space-y-2 p-4 text-sm">
      {data.map((t) => (
        <div key={t.type} className="grid grid-cols-[11rem_1fr_3.5rem] items-center gap-3">
          <span>{t.type}</span>
          <span className="h-2 rounded-full bg-muted">
            <span className="block h-2 rounded-full bg-[#2a78d6]" style={{ width: `${(t.count / total) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted-foreground">{pct(t.count / total)}</span>
        </div>
      ))}
    </Card>
  );
}
