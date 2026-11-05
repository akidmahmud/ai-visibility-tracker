import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { EngineIcon } from "@/components/site-icon";
import { Card, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { ENGINES, fmtDate, fmtDateTime } from "@/lib/format";

type Overview = {
  totals: { workspaces: number; users: number; brands: number; answers30d: number; failed30d: number; calls30d: number; credits30d: number; usd30d: number };
  workspaces: { id: string; name: string; createdAt: string; customDomain: string | null; members: number; brands: number; activeBrands: number; answers30d: number; failed30d: number; lastRunAt: string | null }[];
  users: { id: string; email: string; name: string; createdAt: string; workspaces: string[]; lastSeenAt: string | null }[];
  failures: { id: string; model: string; provider: string; error: string | null; capturedAt: string; brand: { name: string } }[];
  audit: { id: string; actor: string; action: string; target: string; createdAt: string }[];
};

const n = (v: number) => v.toLocaleString("en-US");

export default async function AdminOverview() {
  const o = await api<Overview>("/admin/overview");
  const t = o.totals;
  const failRate = t.answers30d + t.failed30d ? t.failed30d / (t.answers30d + t.failed30d) : 0;
  const tiles: [string, string, string][] = [
    ["Workspaces", n(t.workspaces), `${n(t.users)} users`],
    ["Brands", n(t.brands), "across all workspaces"],
    ["Answers, 30 days", n(t.answers30d), `${n(t.failed30d)} failed (${(failRate * 100).toFixed(1)}%)`],
    ["Provider spend, 30 days", `$${t.usd30d.toFixed(2)}`, `${n(Math.round(t.credits30d))} Cloro credits · ${n(t.calls30d)} calls`],
  ];

  return (
    <>
      <PageHeader title="Admin overview" description="Every agency workspace on this server, its volume and failures. Visible only to the emails in SUPER_ADMIN_EMAILS.">
        <Link href="/admin/providers" className="flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
          Provider routing <ArrowRight className="size-4" />
        </Link>
      </PageHeader>
      <div className="space-y-6">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map(([l, v, note]) => (
            <Card key={l} className="px-4 py-3">
              <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">{l}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
              <dd className="text-xs text-neutral-500">{note}</dd>
            </Card>
          ))}
        </dl>

        <section className="space-y-2">
          <h2 className="font-semibold">Workspaces</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead numeric>Members</TableHead>
                <TableHead numeric>Brands</TableHead>
                <TableHead numeric>Answers (30d)</TableHead>
                <TableHead numeric>Failed (30d)</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.workspaces.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <span className="font-medium">{w.name}</span>
                    {w.customDomain && <span className="block text-xs text-muted-foreground">{w.customDomain}</span>}
                  </TableCell>
                  <TableCell numeric>{w.members}</TableCell>
                  <TableCell numeric>
                    {w.activeBrands}/{w.brands}
                    <span className="block text-[11px] text-muted-foreground">active</span>
                  </TableCell>
                  <TableCell numeric>{n(w.answers30d)}</TableCell>
                  <TableCell numeric className={w.failed30d ? "text-red-700" : undefined}>{n(w.failed30d)}</TableCell>
                  <TableCell>{w.lastRunAt ? fmtDateTime(w.lastRunAt) : "Never"}</TableCell>
                  <TableCell>{fmtDate(w.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Recent capture failures" subtitle="Last 30 days, newest first" />
            {o.failures.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No failures in the last 30 days.</p>
            ) : (
              <ul className="divide-y p-2">
                {o.failures.map((f) => (
                  <li key={f.id} className="flex gap-3 px-2 py-2.5 text-sm">
                    <EngineIcon model={f.model} size={18} />
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">{f.brand.name}</span> · {ENGINES[f.model] ?? f.model} via {f.provider}
                        <span className="float-right text-xs text-muted-foreground">{fmtDateTime(f.capturedAt)}</span>
                      </p>
                      <p className="mt-0.5 flex gap-1 truncate text-xs text-red-700">
                        <AlertTriangle className="size-3.5 shrink-0" /> {f.error ?? "No error message"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Admin changes" subtitle="Provider routing and other super-admin actions" />
            {o.audit.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No changes yet.</p>
            ) : (
              <ul className="divide-y p-2">
                {o.audit.map((a) => (
                  <li key={a.id} className="px-2 py-2.5 text-sm">
                    <span className="font-medium">{a.actor}</span> {a.action.replaceAll("_", " ").toLowerCase()} <span className="font-mono text-xs">{a.target}</span>
                    <span className="float-right text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <section className="space-y-2">
          <h2 className="font-semibold">Users</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Workspaces</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <span className="font-medium">{u.name || u.email}</span>
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                  </TableCell>
                  <TableCell className="text-xs">{u.workspaces.join(", ") || "None"}</TableCell>
                  <TableCell>{u.lastSeenAt ? fmtDateTime(u.lastSeenAt) : "Never"}</TableCell>
                  <TableCell>{fmtDate(u.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </>
  );
}
