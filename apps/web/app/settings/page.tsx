import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ENGINES } from "@/lib/format";

type Workspace = { id: string; name: string; customDomain: string | null; whiteLabel: { agencyName?: string; logoUrl?: string; primaryColor?: string; accentColor?: string } | null };
type Usage = {
  days: number;
  totals: { answers: number; credits: number; usd: number };
  cloroBalance: number | null;
  monthlyBudget: number | null;
  daily: { day: string; provider: string; model: string; answers: number; failed: number; credits: number; usd: number }[];
};

const APP_HOST = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const [ws, usage] = await Promise.all([api<Workspace>("/workspace"), api<Usage>("/workspace/usage?days=30")]);
  const wl = ws.whiteLabel ?? {};

  async function saveBranding(form: FormData) {
    "use server";
    const text = (k: string) => String(form.get(k) ?? "").trim();
    try {
      await api("/workspace", {
        method: "PATCH",
        body: JSON.stringify({
          name: text("name") || undefined,
          whiteLabel: { agencyName: text("agencyName") || undefined, logoUrl: text("logoUrl"), primaryColor: text("primaryColor"), accentColor: text("accentColor") },
          customDomain: text("customDomain") || null,
        }),
      });
    } catch (e) {
      redirect(`/settings?error=${encodeURIComponent((e as Error).message.includes("409") ? "That domain is already used by another workspace." : "Check the fields: colors are hex (#1d4ed8), the domain is a hostname, the logo a full URL.")}`);
    }
    revalidatePath("/settings");
  }
  return (
    <div className="max-w-5xl space-y-10">
      <PageHeader title="Workspace settings" description="White-label branding for client reports, and what the tracking costs." />
      {sp.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">Branding for client reports</h2>
        <p className="text-sm text-muted-foreground">Share links show your agency's name, logo and colors, never ours.</p>
        <Card className="p-4">
          <form action={saveBranding} className="grid gap-4 text-sm sm:grid-cols-2">
            <Label className="space-y-1">
              <span>Workspace name</span>
              <Input name="name" defaultValue={ws.name} maxLength={100} />
            </Label>
            <Label className="space-y-1">
              <span>Agency name on reports</span>
              <Input name="agencyName" defaultValue={wl.agencyName ?? ""} maxLength={100} placeholder={ws.name} />
            </Label>
            <Label className="space-y-1 sm:col-span-2">
              <span>Logo URL (PNG or SVG, about 40px tall)</span>
              <Input name="logoUrl" type="url" defaultValue={wl.logoUrl ?? ""} placeholder="https://agency.com/logo.svg" />
            </Label>
            <Label className="flex items-center gap-3">
              <input type="color" name="primaryColor" defaultValue={wl.primaryColor ?? "#171717"} className="h-9 w-12 rounded border" />
              Main color (buttons, headings)
            </Label>
            <Label className="flex items-center gap-3">
              <input type="color" name="accentColor" defaultValue={wl.accentColor ?? "#2a78d6"} className="h-9 w-12 rounded border" />
              Accent color
            </Label>
            <Label className="space-y-1 sm:col-span-2">
              <span>Report domain (optional)</span>
              <Input name="customDomain" defaultValue={ws.customDomain ?? ""} placeholder="reports.youragency.com" />
              <span className="block text-xs text-muted-foreground">
                Add a DNS CNAME record pointing this hostname to <code>{APP_HOST}</code>. The HTTPS certificate is issued automatically on the first visit. Share links then work on this domain.
              </span>
            </Label>
            <div className="sm:col-span-2">
              <Button>Save branding</Button>
            </div>
          </form>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Usage and costs, last {usage.days} days</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["AI answers captured", usage.totals.answers.toLocaleString("en-US")],
            ["Cloro credits used", Math.round(usage.totals.credits).toLocaleString("en-US")],
            ["Estimated cost", `$${usage.totals.usd.toFixed(2)}`],
            ["Cloro balance", usage.cloroBalance == null ? "–" : usage.cloroBalance.toLocaleString("en-US")],
          ].map(([l, v]) => (
            <Card key={l} className="px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{l}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
            </Card>
          ))}
        </div>
        {usage.monthlyBudget && <p className="text-xs text-muted-foreground">Monthly credit budget: {usage.monthlyBudget.toLocaleString("en-US")}. Runs pause when it would be exceeded.</p>}
        {usage.daily.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead numeric>Answers</TableHead>
                <TableHead numeric>Failed</TableHead>
                <TableHead numeric>Credits</TableHead>
                <TableHead numeric>Est. USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.daily.map((r) => (
                <TableRow key={`${r.day}-${r.provider}-${r.model}`}>
                  <TableCell>{r.day}</TableCell>
                  <TableCell>{r.provider}</TableCell>
                  <TableCell>{ENGINES[r.model] ?? r.model}</TableCell>
                  <TableCell numeric>{r.answers}</TableCell>
                  <TableCell numeric>{r.failed ? <Badge variant="danger">{r.failed}</Badge> : 0}</TableCell>
                  <TableCell numeric>{Math.round(r.credits)}</TableCell>
                  <TableCell numeric>${r.usd.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

    </div>
  );
}
