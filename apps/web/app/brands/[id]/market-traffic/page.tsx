import { Info } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { SiteIcon } from "@/components/site-icon";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { getBrand, getCompetitors } from "@/lib/brand";
import { vis } from "@/lib/format";
import type { Summary } from "@/lib/types";

/**
 * Website reach (third-party traffic estimates) next to AI visibility.
 * ponytail: no estimate provider is wired yet (Similarweb needs a paid key); the page shows the AI side and says so.
 */
export default async function MarketTraffic({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [brand, competitors, summary] = await Promise.all([getBrand(id), getCompetitors(id), api<Summary>(`/brands/${id}/summary?days=30`)]);
  const visOf = new Map(summary.entities.map((e) => [e.entityId, e.visibility]));
  const rows = [
    { key: "self", name: brand.name, domain: brand.domain as string | null, self: true, visibility: summary.brand?.visibility ?? null },
    ...competitors.map((c) => ({ key: c.id, name: c.entity.canonicalName, domain: c.entity.domain, self: false, visibility: visOf.get(c.entityId) ?? null })),
  ];

  return (
    <>
      <PageHeader
        title="Market Traffic"
        description={`How ${brand.name}'s estimated website reach compares with the competitors AI mentions, without connecting analytics.`}
      >
        <Link href={`/brands/${id}/traffic`} className="rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">Measured AI referrals →</Link>
      </PageHeader>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">Monthly visits</p>
            <p className="mt-1 text-2xl font-semibold">–</p>
            <p className="text-xs text-neutral-500">no estimate source connected</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">Site coverage</p>
            <p className="mt-1 text-2xl font-semibold">
              0 <span className="text-base font-normal text-neutral-500">of {rows.length}</span>
            </p>
            <p className="text-xs text-neutral-500">sites with a traffic estimate</p>
          </Card>
          <Card className="px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">AI visibility</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{vis(summary.brand?.visibility)}</p>
            <p className="text-xs text-neutral-500">last 30 days, all engines</p>
          </Card>
        </div>

        <Card className="flex gap-3 border-amber-200 bg-amber-50/60 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <p>
            Traffic estimates come from a market-data provider (Similarweb). It isn&apos;t connected on this server yet, so only AI visibility is shown.
            Your own measured visits from AI assistants are on <Link href={`/brands/${id}/traffic`} className="underline">Google Analytics</Link>.
          </p>
        </Card>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead numeric>Estimated visits</TableHead>
              <TableHead numeric>AI visibility</TableHead>
              <TableHead numeric>Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key} className={r.self ? "bg-amber-50/60" : undefined}>
                <TableCell>
                  <span className="flex items-center gap-2.5">
                    <SiteIcon domain={r.domain} name={r.name} size={22} />
                    <span>
                      <span className="font-medium">{r.name}</span>
                      {r.self && <span className="ml-1.5 rounded-full bg-brand-soft px-1.5 py-px text-[10px] font-semibold text-brand">You</span>}
                      <span className="block text-xs text-muted-foreground">{r.domain ?? "No website saved"}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell numeric>–</TableCell>
                <TableCell numeric>{vis(r.visibility)}</TableCell>
                <TableCell numeric className="text-xs text-muted-foreground">{r.domain ? "Waiting for estimate source" : "Add a website"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
