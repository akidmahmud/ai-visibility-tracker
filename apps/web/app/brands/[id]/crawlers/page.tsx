import { Bot, Cloud, KeyRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/shell/app-shell";
import { SiteIcon } from "@/components/site-icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api";

type Crawlers = {
  key: string | null;
  bots: { bot: string; owner: string | null; purpose: string | null; hits: number }[];
  topPages: { path: string; hits: number }[];
};

const n = (v: number) => v.toLocaleString("en-US");
const OWNER_SITE: Record<string, string> = {
  OpenAI: "openai.com",
  Anthropic: "anthropic.com",
  Perplexity: "perplexity.ai",
  Google: "google.com",
  Meta: "meta.com",
  Apple: "apple.com",
  Amazon: "amazon.com",
  ByteDance: "bytedance.com",
  "Common Crawl": "commoncrawl.org",
  Mistral: "mistral.ai",
  DuckDuckGo: "duckduckgo.com",
  Cohere: "cohere.com",
};

export default async function CrawlersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await api<Crawlers>(`/brands/${id}/crawlers?days=30`);
  const ingest = `${process.env.PUBLIC_API_URL ?? process.env.API_URL}/public/crawler-hits`;
  const total = c.bots.reduce((s, b) => s + b.hits, 0);
  const max = Math.max(1, ...c.bots.map((b) => b.hits));

  async function rotate() {
    "use server";
    await api(`/brands/${id}/crawler-key`, { method: "POST" });
    revalidatePath(`/brands/${id}/crawlers`);
  }

  const code = "mt-1 block select-all break-all rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-xs";
  return (
    <>
      <PageHeader title="AI Crawlers" description="Which AI bots read the site, and which pages they read most. Only bot visits are logged; people are never tracked." />
      <div className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["Crawler visits", n(total), "last 30 days"],
              ["Different bots", n(c.bots.length), "OpenAI, Anthropic, Perplexity…"],
              ["Pages read", n(c.topPages.length), c.topPages.length >= 25 ? "top 25 shown" : "distinct paths"],
            ] as const
          ).map(([l, v, note]) => (
            <Card key={l} className="px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{l}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
              <dd className="text-xs text-neutral-500">{note}</dd>
            </Card>
          ))}
        </dl>

        {c.bots.length === 0 ? (
          <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <Bot className="size-5" /> No AI crawler visits recorded yet. Set up the Cloudflare Worker or the WordPress plugin below.
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Crawlers" subtitle="Visits per bot" />
              <ul className="divide-y p-2">
                {c.bots.map((b) => (
                  <li key={b.bot} className="flex items-center gap-3 px-2 py-2.5 text-sm">
                    <SiteIcon domain={b.owner ? OWNER_SITE[b.owner] : null} name={b.owner ?? b.bot} size={22} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {b.bot} <span className="font-normal text-muted-foreground">· {b.owner}</span>
                      </p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${(b.hits / max) * 100}%` }} />
                      </div>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] capitalize text-neutral-600">{b.purpose}</span>
                    <span className="w-12 text-right tabular-nums">{n(b.hits)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Most-read pages" subtitle="Paths AI bots requested" />
              <ul className="divide-y p-2">
                {c.topPages.map((p) => (
                  <li key={p.path} className="flex items-center gap-3 px-2 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{p.path}</span>
                    <span className="tabular-nums">{n(p.hits)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        <Card className="max-w-4xl">
          <CardHeader title="Set up crawler logging" subtitle="Two values connect the site to this dashboard" />
          <div className="space-y-5 p-4 text-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="font-medium">Ingest URL</p>
                <code className={code}>{ingest}</code>
              </div>
              <div>
                <p className="font-medium">Crawler key</p>
                {c.key ? <code className={code}>{c.key}</code> : <p className="mt-1 text-muted-foreground">No key yet.</p>}
              </div>
            </div>
            <form action={rotate}>
              <Button variant="outline" size="sm">
                <KeyRound className="size-4" /> {c.key ? "Rotate key (the old one stops working)" : "Create key"}
              </Button>
            </form>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-2 font-medium">
                  <Cloud className="size-4 text-orange-500" /> Cloudflare
                </p>
                <p className="mt-1 text-muted-foreground">
                  Create a Worker from <code>integrations/crawler-logs/cloudflare-worker.js</code>, add the route <code>yourdomain.com/*</code>, and set
                  <code> INGEST_URL</code> and <code>CRAWLER_KEY</code> (as a secret) to the values above. Pages load exactly as before.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="flex items-center gap-2 font-medium">
                  <SiteIcon domain="wordpress.org" name="WordPress" size={16} /> WordPress
                </p>
                <p className="mt-1 text-muted-foreground">
                  Upload the <code>integrations/crawler-logs/wordpress/ai-crawler-log</code> folder as a plugin, activate it, then paste both values in Settings → AI Crawler Log.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
