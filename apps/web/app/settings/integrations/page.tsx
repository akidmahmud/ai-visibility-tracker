import { Bot, Download, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiKeyForm } from "@/components/api-key-form";
import { PeekabooImportForm } from "@/components/peekaboo-import";
import { PageHeader } from "@/components/shell/app-shell";
import { SiteIcon } from "@/components/site-icon";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

type Google = { configured: boolean; connected: boolean; email: string | null };
type ApiKey = { id: string; name: string; prefix: string; scope: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };

const Status = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>{children}</span>
);

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ google?: string; error?: string }> }) {
  const sp = await searchParams;
  const [google, keys, brands] = await Promise.all([api<Google>("/integrations/google"), api<ApiKey[]>("/api-keys"), api<{ id: string }[]>("/brands")]);
  const mcpUrl = `${process.env.PUBLIC_API_URL ?? process.env.API_URL}/mcp`;
  const activeKeys = keys.filter((k) => !k.revokedAt);

  async function connectGoogle() {
    "use server";
    const { url } = await api<{ url: string }>("/integrations/google/start");
    redirect(url);
  }
  async function disconnectGoogle() {
    "use server";
    await api("/integrations/google", { method: "DELETE" });
    revalidatePath("/settings/integrations");
  }
  async function createKey(_prev: unknown, form: FormData) {
    "use server";
    try {
      const { key } = await api<{ key: string }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: String(form.get("name") ?? ""), scope: form.get("write") === "on" ? "write" : "read" }),
      });
      revalidatePath("/settings/integrations");
      return { key };
    } catch (e) {
      return { error: (e as Error).message.replace(/^API \d+: /, "") };
    }
  }
  async function revokeKey(form: FormData) {
    "use server";
    await api(`/api-keys/${form.get("keyId")}`, { method: "DELETE" });
    revalidatePath("/settings/integrations");
  }
  async function importPeekaboo(_prev: unknown, form: FormData) {
    "use server";
    try {
      return await api<{ brands: number; report: { brand: string; created: boolean; prompts: number; competitors: number; baselineDays: number; error?: string }[] }>(
        "/workspace/import/peekaboo",
        { method: "POST", body: JSON.stringify({ apiKey: String(form.get("apiKey") ?? "") }) },
      );
    } catch (e) {
      return { error: (e as Error).message.replace(/^API \d+: /, "") };
    }
  }

  return (
    <>
      <PageHeader title="Integrations" description="Connect the tools that add search, analytics and crawler data, and let AI assistants read your dashboards." />
      {sp.google === "connected" && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Google account connected.</p>}
      {sp.error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}

      <div className="grid max-w-5xl gap-6">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <SiteIcon domain="google.com" name="Google" size={18} /> Google Search Console and Analytics
              </span>
            }
            subtitle="Search queries and visits from AI assistants, read-only"
          >
            <Status on={google.connected}>{google.connected ? "Connected" : "Not connected"}</Status>
          </CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            {!google.configured ? (
              <p className="text-muted-foreground">Not set up on this server yet: it needs a Google OAuth client (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).</p>
            ) : google.connected ? (
              <>
                <p>
                  Connected as <span className="font-medium">{google.email}</span>. Pick each brand&apos;s properties in its brand settings.
                </p>
                <form action={disconnectGoogle}>
                  <Button variant="outline" size="sm">Disconnect</Button>
                </form>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">Connect the Google account that can see your clients&apos; Search Console and GA4 properties.</p>
                <form action={connectGoogle}>
                  <Button size="sm">Connect Google</Button>
                </form>
              </>
            )}
          </div>
        </Card>

        <Card id="mcp" className="scroll-mt-20">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand" /> AI assistants (MCP) and API keys
              </span>
            }
            subtitle="Ask Claude, Cursor or ChatGPT how a brand is trending; call the REST API from scripts"
          >
            <Status on={activeKeys.length > 0}>{activeKeys.length ? `${activeKeys.length} active key${activeKeys.length > 1 ? "s" : ""}` : "No keys"}</Status>
          </CardHeader>
          <div className="space-y-4 p-4 text-sm">
            <ol className="grid gap-3 md:grid-cols-3">
              <li className="rounded-lg border p-3">
                <p className="font-medium">1. Create a key</p>
                <p className="mt-1 text-muted-foreground">Read-only is enough for assistants. The key is shown once.</p>
              </li>
              <li className="rounded-lg border p-3">
                <p className="font-medium">2. Add the server</p>
                <p className="mt-1 text-muted-foreground">In the assistant, add a remote MCP server (Streamable HTTP) with this URL:</p>
                <code className="mt-1 block select-all break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs">{mcpUrl}</code>
              </li>
              <li className="rounded-lg border p-3">
                <p className="font-medium">3. Send the key</p>
                <p className="mt-1 text-muted-foreground">As the header:</p>
                <code className="mt-1 block break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs">Authorization: Bearer &lt;key&gt;</code>
              </li>
            </ol>
            <ApiKeyForm action={createKey} />
            {keys.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id} className={k.revokedAt ? "text-muted-foreground line-through" : undefined}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <KeyRound className="size-3.5 text-muted-foreground" /> {k.name}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{k.prefix}…</TableCell>
                      <TableCell>{k.scope === "write" ? "Read and change" : "Read only"}</TableCell>
                      <TableCell>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}</TableCell>
                      <TableCell className="text-right">
                        {!k.revokedAt && (
                          <form action={revokeKey}>
                            <input type="hidden" name="keyId" value={k.id} />
                            <Button variant="outline" size="sm">Revoke</Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Bot className="size-4" /> AI crawler logs
              </span>
            }
            subtitle="Cloudflare Worker or WordPress plugin, set up per brand"
          />
          <p className="p-4 text-sm text-muted-foreground">
            Each brand has its own key and setup steps on its{" "}
            {brands[0] ? (
              <Link href={`/brands/${brands[0].id}/crawlers`} className="text-brand underline">
                AI Crawlers
              </Link>
            ) : (
              "AI Crawlers"
            )}{" "}
            page.
          </p>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Download className="size-4" /> Import from Peekaboo
              </span>
            }
            subtitle="Brands, topics, prompts, competitors, plus 90 days of Peekaboo's score to compare side by side"
          />
          <div className="space-y-3 p-4 text-sm">
            <p className="text-muted-foreground">Create a read-only API key in Peekaboo under Settings → Integrations. It is used once and not stored.</p>
            <PeekabooImportForm action={importPeekaboo} />
          </div>
        </Card>
      </div>
    </>
  );
}
