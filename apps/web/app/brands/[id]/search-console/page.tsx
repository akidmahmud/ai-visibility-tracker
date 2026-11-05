import { CheckCircle2, Search } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

type Gsc =
  | { connected: false; reason: string; queries: [] }
  | {
      connected: true;
      property: string;
      totals: { clicks: number; impressions: number; queries: number };
      queries: { query: string; clicks: number; impressions: number; ctr: number; position: number; tracked: boolean }[];
    };

const n = (v: number) => v.toLocaleString("en-US");

export default async function SearchConsolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gsc = await api<Gsc>(`/brands/${id}/search-console?days=90`).catch((e: Error) => ({ connected: false as const, reason: `Google returned an error: ${e.message.slice(0, 160)}`, queries: [] as [] }));

  async function track(form: FormData) {
    "use server";
    await api(`/brands/${id}/prompts`, { method: "POST", body: JSON.stringify({ texts: [String(form.get("query"))], source: "GSC" }) });
    revalidatePath(`/brands/${id}/search-console`);
  }

  if (!gsc.connected) {
    return (
      <>
        <PageHeader title="Search Console" />
        <Card className="mx-auto max-w-2xl p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <Search className="size-5" />
          </span>
          <h2 className="mt-4 text-xl font-semibold">Track the searches that already bring you visitors</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Connect Google Search Console to see which Google searches lead to the site, then track the important ones as prompts in the AI engines.
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm">
            {["Top 100 search queries with clicks, impressions, CTR and rank", "See which ones you already track in AI answers", "Add any query as a prompt in one click"].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {t}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm font-medium text-amber-800">{gsc.reason}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/settings/integrations" className={buttonVariants()}>Open Integrations</Link>
            <Link href={`/brands/${id}/settings`} className={buttonVariants({ variant: "outline" })}>Brand settings</Link>
          </div>
        </Card>
      </>
    );
  }

  const tiles: [string, string][] = [
    ["Clicks", n(gsc.totals.clicks)],
    ["Impressions", n(gsc.totals.impressions)],
    ["Queries", n(gsc.totals.queries)],
  ];
  return (
    <>
      <PageHeader title="Search Console" description={`Google searches that led to ${gsc.property} in the last 90 days. Track the valuable ones as AI prompts.`} />
      <div className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          {tiles.map(([l, v]) => (
            <Card key={l} className="px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{l}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
            </Card>
          ))}
        </dl>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Query</TableHead>
              <TableHead numeric>Clicks</TableHead>
              <TableHead numeric>Impressions</TableHead>
              <TableHead numeric>CTR</TableHead>
              <TableHead numeric>Avg rank</TableHead>
              <TableHead><span className="sr-only">Track</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gsc.queries.map((q) => (
              <TableRow key={q.query}>
                <TableCell>{q.query}</TableCell>
                <TableCell numeric>{n(q.clicks)}</TableCell>
                <TableCell numeric>{n(q.impressions)}</TableCell>
                <TableCell numeric>{(q.ctr * 100).toFixed(1)}%</TableCell>
                <TableCell numeric>{q.position.toFixed(1)}</TableCell>
                <TableCell className="text-right">
                  {q.tracked ? (
                    <span className="text-xs text-emerald-700">Tracked</span>
                  ) : (
                    <form action={track}>
                      <input type="hidden" name="query" value={q.query} />
                      <Button size="sm" variant="outline">Track as prompt</Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
