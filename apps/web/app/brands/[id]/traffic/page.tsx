import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { EngineIcon } from "@/components/site-icon";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

type Traffic =
  | { connected: false; reason: string }
  | { connected: true; totalSessions: number; sources: { assistant: string; sessions: number; conversions: number }[]; daily: { day: string; sessions: number }[] };

const n = (v: number) => v.toLocaleString("en-US");
const ICON: Record<string, string> = { ChatGPT: "chatgpt", Perplexity: "perplexity", Gemini: "gemini", Claude: "claude", Copilot: "copilot" };

export default async function GoogleAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await api<Traffic>(`/brands/${id}/ai-traffic?days=90`).catch((e: Error) => ({ connected: false as const, reason: `Google returned an error: ${e.message.slice(0, 160)}` }));

  if (!t.connected) {
    return (
      <>
        <PageHeader title="Google Analytics" />
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <BarChart3 className="size-5" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">See the visitors AI assistants send you</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect Google Analytics 4 to count sessions that came from ChatGPT, Perplexity, Gemini, Claude and Copilot, and the key events they led to.
          </p>
          <p className="mt-6 text-sm font-medium text-amber-800">{t.reason}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/settings/integrations" className={buttonVariants()}>Open Integrations</Link>
            <Link href={`/brands/${id}/settings`} className={buttonVariants({ variant: "outline" })}>Brand settings</Link>
          </div>
        </Card>
      </>
    );
  }

  const ai = t.sources.reduce((s, r) => s + r.sessions, 0);
  const conv = t.sources.reduce((s, r) => s + r.conversions, 0);
  const tiles: [string, string, string][] = [
    ["AI sessions", n(ai), "last 90 days"],
    ["Share of all sessions", `${((ai / Math.max(t.totalSessions, 1)) * 100).toFixed(1)}%`, `of ${n(t.totalSessions)} sessions`],
    ["Key events from AI", n(conv), "conversions GA4 counts"],
  ];
  return (
    <>
      <PageHeader title="Google Analytics" description="Visitors that arrived from AI assistants, measured by your GA4 property." />
      <div className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          {tiles.map(([l, v, note]) => (
            <Card key={l} className="px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{l}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
              <dd className="text-xs text-neutral-500">{note}</dd>
            </Card>
          ))}
        </dl>
        {t.sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions from AI assistants in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assistant</TableHead>
                <TableHead numeric>Sessions</TableHead>
                <TableHead numeric>Key events</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.sources.map((s) => (
                <TableRow key={s.assistant}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <EngineIcon model={ICON[s.assistant] ?? s.assistant} /> {s.assistant}
                    </span>
                  </TableCell>
                  <TableCell numeric>{n(s.sessions)}</TableCell>
                  <TableCell numeric>{n(s.conversions)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  );
}
