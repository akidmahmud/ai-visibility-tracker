import type { Intent, Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { nextRunAt, normalizeDomain, PeekabooImport, UpdateWorkspace } from "@avt/shared";
import { Body, ConflictException, Controller, Get, NotFoundException, Patch, Post, Query } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { CurrentWorkspace, Public } from "./auth/workspace.guard";
import { trackCompetitor } from "./brands/track-competitor";
import { PeekabooClient } from "./integrations/peekaboo";

class UpdateWorkspaceDto extends createZodDto(UpdateWorkspace) {}
class PeekabooImportDto extends createZodDto(PeekabooImport) {}

const DAY = 24 * 3600 * 1000;
const INTENTS = ["COMMERCIAL", "INVESTIGATIONAL", "INFORMATIONAL", "NAVIGATIONAL"];
const MAX_PROMPTS = Number(process.env.MAX_PROMPTS_PER_BRAND ?? 200);

@Controller()
export class WorkspaceController {
  constructor(private readonly prisma: PrismaClient) {}

  @Public()
  @Get("health")
  health() {
    return { ok: true };
  }

  /**
   * Caddy on-demand TLS "ask" endpoint (handoff §17.13): a certificate is issued only for hostnames a
   * workspace registered as its report domain. 200 = allow, 404 = refuse.
   */
  @Public()
  @Get("public/domains/check")
  async domainCheck(@Query("domain") domain?: string) {
    const ws = domain ? await this.prisma.workspace.findUnique({ where: { customDomain: domain.toLowerCase() }, select: { id: true } }) : null;
    if (!ws) throw new NotFoundException();
    return { ok: true };
  }

  @Get("workspace")
  get(@CurrentWorkspace() ws: Workspace) {
    return ws;
  }

  /** Agency name, white-label branding and the custom report domain. */
  @Patch("workspace")
  async update(@CurrentWorkspace() ws: Workspace, @Body() body: UpdateWorkspaceDto) {
    if (body.customDomain) {
      const taken = await this.prisma.workspace.findFirst({ where: { customDomain: body.customDomain, id: { not: ws.id } } });
      if (taken) throw new ConflictException("That domain is already used by another workspace");
    }
    return this.prisma.workspace.update({
      where: { id: ws.id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.whiteLabel ? { whiteLabel: body.whiteLabel } : {}),
        ...(body.customDomain !== undefined ? { customDomain: body.customDomain } : {}),
      },
    });
  }

  /** Answers, credits and estimated USD per day and provider for this workspace's brands. */
  @Get("workspace/usage")
  async usage(@CurrentWorkspace() ws: Workspace, @Query("days") daysParam?: string) {
    const days = Math.min(Math.max(Number(daysParam) || 30, 1), 365);
    const since = new Date(Date.now() - days * DAY);
    const rows = await this.prisma.$queryRaw<{ day: Date; provider: string; model: string; answers: bigint; failed: bigint; credits: number | null }[]>`
      SELECT a."capturedAt"::date AS day, a."provider", a."model"::text AS model,
             count(*) AS answers, count(*) FILTER (WHERE a."status" = 'FAILED') AS failed, sum(a."costCredits")::float AS credits
      FROM "Answer" a JOIN "Brand" b ON b."id" = a."brandId"
      WHERE b."workspaceId" = ${ws.id} AND a."capturedAt" >= ${since}
      GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 3`;
    const usdPerCredit = Number(process.env.CLORO_USD_PER_CREDIT ?? 0.00038);
    let balance: number | null = null;
    if (process.env.CLORO_API_KEY) {
      const res = await fetch(`${process.env.CLORO_BASE_URL || "https://api.cloro.dev"}/v1/credits`, { headers: { Authorization: `Bearer ${process.env.CLORO_API_KEY}` } }).catch(() => null);
      balance = res?.ok ? ((await res.json()) as { remaining?: number }).remaining ?? null : null;
    }
    const daily = rows.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      provider: r.provider,
      model: r.model,
      answers: Number(r.answers),
      failed: Number(r.failed),
      credits: r.credits ?? 0,
      usd: (r.credits ?? 0) * usdPerCredit,
    }));
    return {
      days,
      totals: { answers: daily.reduce((s, r) => s + r.answers, 0), credits: daily.reduce((s, r) => s + r.credits, 0), usd: daily.reduce((s, r) => s + r.usd, 0) },
      cloroBalance: balance,
      monthlyBudget: Number(process.env.MONTHLY_CREDIT_BUDGET) || null,
      daily,
    };
  }

  /**
   * One-time import from Peekaboo with the client's API key (handoff §17.15): brands, topics, prompts and
   * competitors, plus 90 days of Peekaboo's own daily score as a comparison baseline. The key is not stored.
   * Existing brands (same domain) are updated in place; nothing is deleted.
   */
  @Post("workspace/import/peekaboo")
  async importPeekaboo(@CurrentWorkspace() ws: Workspace, @Body() body: PeekabooImportDto) {
    const pk = new PeekabooClient(body.apiKey);
    const report: { brand: string; created: boolean; prompts: number; competitors: number; baselineDays: number; error?: string }[] = [];
    for (const b of await pk.brands()) {
      const domain = normalizeDomain(b.url);
      if (!domain) continue;
      try {
        const existing = await this.prisma.brand.findFirst({ where: { workspaceId: ws.id, domain, deletedAt: null } });
        const brand =
          existing ??
          (await this.prisma.brand.create({
            data: {
              workspaceId: ws.id,
              name: b.name,
              websiteUrl: b.url,
              domain,
              enabledModels: ["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode"],
              nextRunAt: nextRunAt("WEEKLY", new Date()),
            },
          }));

        const [prompts, competitors, baseline] = await Promise.all([pk.prompts(b.id), pk.competitors(b.id), pk.baseline(b.id, b.name).catch(() => [])]);
        const have = new Set((await this.prisma.prompt.findMany({ where: { brandId: brand.id, deletedAt: null }, select: { text: true } })).map((p) => p.text.toLowerCase()));
        let added = 0;
        for (const p of prompts) {
          if (have.has(p.text.toLowerCase()) || have.size >= MAX_PROMPTS) continue;
          const topic = p.category
            ? ((await this.prisma.topic.findFirst({ where: { brandId: brand.id, name: { equals: p.category, mode: "insensitive" } } })) ??
              (await this.prisma.topic.create({ data: { brandId: brand.id, name: p.category } })))
            : null;
          const intent = (INTENTS.includes(p.intent?.toUpperCase() ?? "") ? p.intent!.toUpperCase() : "COMMERCIAL") as Intent;
          await this.prisma.prompt.create({ data: { brandId: brand.id, text: p.text, intent, topicId: topic?.id } });
          have.add(p.text.toLowerCase());
          added++;
        }
        for (const c of competitors) await trackCompetitor(this.prisma, brand.id, c.name, c.url);
        for (const d of baseline) {
          await this.prisma.peekabooBaseline.upsert({
            where: { brandId_day: { brandId: brand.id, day: new Date(d.day) } },
            update: { score: d.score },
            create: { brandId: brand.id, day: new Date(d.day), score: d.score },
          });
        }
        report.push({ brand: b.name, created: !existing, prompts: added, competitors: competitors.length, baselineDays: baseline.length });
      } catch (e) {
        report.push({ brand: b.name, created: false, prompts: 0, competitors: 0, baselineDays: 0, error: (e as Error).message });
      }
    }
    return { brands: report.length, report };
  }
}
