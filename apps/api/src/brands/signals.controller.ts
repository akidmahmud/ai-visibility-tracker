import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { AI_BOTS, aiBot, aiReferrer } from "@avt/shared";
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { CurrentWorkspace, Public } from "../auth/workspace.guard";
import { ga4SessionsBySource, gscQueries } from "../integrations/google";
import { googleAccess } from "../integrations/google.controller";
import { ownedBrand } from "./brand-scope";

const DAY = 24 * 3600 * 1000;
const MAX_HITS = 500;

/** AI crawler logs (Cloudflare Worker / WordPress plugin) and AI referral traffic from GA4 (handoff §15 Phase 6). */
@Controller()
export class SignalsController {
  constructor(private readonly prisma: PrismaClient) {}

  /** Ingest from the site: { hits: [{ ua, path, ts? }] }, authenticated by the brand's crawler key. Non-AI agents are ignored. */
  @Public()
  @Post("public/crawler-hits")
  @HttpCode(202)
  async ingest(@Headers("x-crawler-key") key: string | undefined, @Body() body: { hits?: { ua?: string; path?: string; ts?: string }[] }) {
    const brand = key ? await this.prisma.brand.findUnique({ where: { crawlerKey: key }, select: { id: true } }) : null;
    if (!brand) throw new UnauthorizedException();
    const hits = Array.isArray(body?.hits) ? body.hits.slice(0, MAX_HITS) : [];
    if (!hits.length) throw new BadRequestException("Send { hits: [{ ua, path }] }");

    const counts = new Map<string, number>();
    for (const h of hits) {
      const bot = aiBot(String(h.ua ?? ""));
      if (!bot) continue;
      const path = String(h.path ?? "/").split(/[?#]/)[0]!.slice(0, 300) || "/";
      const ts = h.ts ? new Date(h.ts) : new Date();
      const day = (Number.isNaN(ts.getTime()) ? new Date() : ts).toISOString().slice(0, 10);
      const k = `${day}|${bot}|${path}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const [k, n] of counts) {
      const [day, bot, path] = k.split("|") as [string, string, string];
      await this.prisma.crawlerHit.upsert({
        where: { brandId_day_bot_path: { brandId: brand.id, day: new Date(day), bot, path } },
        create: { brandId: brand.id, day: new Date(day), bot, path, hits: n },
        update: { hits: { increment: n } },
      });
    }
    return { accepted: [...counts.values()].reduce((s, n) => s + n, 0) };
  }

  /** Creates (or rotates) the brand's ingest key for the Worker / plugin. */
  @Post("brands/:brandId/crawler-key")
  async rotateKey(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const key = `cwl_${randomBytes(18).toString("base64url")}`;
    await this.prisma.brand.update({ where: { id: brandId }, data: { crawlerKey: key } });
    return { key };
  }

  @Get("brands/:brandId/crawlers")
  async crawlers(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Query("days") d?: string) {
    const brand = await ownedBrand(this.prisma, ws, brandId);
    const since = new Date(Date.now() - Math.min(Math.max(Number(d) || 30, 1), 365) * DAY);
    const where = { brandId, day: { gte: since } };
    const [byBot, byDay, byPath] = await Promise.all([
      this.prisma.crawlerHit.groupBy({ by: ["bot"], where, _sum: { hits: true }, orderBy: { _sum: { hits: "desc" } } }),
      this.prisma.crawlerHit.groupBy({ by: ["day", "bot"], where, _sum: { hits: true }, orderBy: { day: "asc" } }),
      this.prisma.crawlerHit.groupBy({ by: ["path"], where, _sum: { hits: true }, orderBy: { _sum: { hits: "desc" } }, take: 25 }),
    ]);
    const meta = new Map(AI_BOTS.map((b) => [b.name, b]));
    return {
      key: brand.crawlerKey,
      bots: byBot.map((b) => ({ bot: b.bot, owner: meta.get(b.bot)?.owner ?? null, purpose: meta.get(b.bot)?.purpose ?? null, hits: b._sum.hits ?? 0 })),
      daily: byDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), bot: r.bot, hits: r._sum.hits ?? 0 })),
      topPages: byPath.map((p) => ({ path: p.path, hits: p._sum.hits ?? 0 })),
    };
  }

  /** Visits from AI assistants (chatgpt.com, perplexity.ai, …) in the brand's GA4 property. */
  @Get("brands/:brandId/ai-traffic")
  async aiTraffic(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Query("days") d?: string) {
    const brand = await ownedBrand(this.prisma, ws, brandId);
    if (!brand.ga4PropertyId) return { connected: false, reason: "Link a GA4 property in the brand settings.", sources: [], daily: [] };
    const access = await googleAccess(this.prisma, ws.id);
    if (!access) return { connected: false, reason: "Connect Google in workspace settings.", sources: [], daily: [] };
    const rows = await ga4SessionsBySource(access, brand.ga4PropertyId, Math.min(Math.max(Number(d) || 90, 1), 365));
    const ai = rows.flatMap((r) => {
      const assistant = aiReferrer(r.source);
      return assistant ? [{ ...r, assistant }] : [];
    });
    const sum = (rs: typeof ai) => ({ sessions: rs.reduce((s, r) => s + r.sessions, 0), conversions: rs.reduce((s, r) => s + r.conversions, 0) });
    return {
      connected: true,
      totalSessions: rows.reduce((s, r) => s + r.sessions, 0),
      sources: [...Map.groupBy(ai, (r) => r.assistant)].map(([assistant, rs]) => ({ assistant, ...sum(rs) })).sort((a, b) => b.sessions - a.sessions),
      daily: [...Map.groupBy(ai, (r) => r.date)].map(([date, rs]) => ({ day: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`, ...sum(rs) })).sort((a, b) => a.day.localeCompare(b.day)),
    };
  }

  /** Top Google search queries for the brand's Search Console property, with which ones are already tracked as prompts. */
  @Get("brands/:brandId/search-console")
  async searchConsole(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Query("days") d?: string) {
    const brand = await ownedBrand(this.prisma, ws, brandId);
    const access = await googleAccess(this.prisma, ws.id);
    if (!access) return { connected: false, reason: "Connect Google in Integrations.", queries: [] };
    if (!brand.gscProperty) return { connected: false, reason: "Pick this brand's Search Console property in brand settings.", queries: [] };
    const rows = await gscQueries(access, brand.gscProperty, Math.min(Math.max(Number(d) || 90, 1), 480));
    const tracked = new Set((await this.prisma.prompt.findMany({ where: { brandId }, select: { text: true } })).map((p) => p.text.trim().toLowerCase()));
    const sum = (k: "clicks" | "impressions") => rows.reduce((s, r) => s + r[k], 0);
    return {
      connected: true,
      property: brand.gscProperty,
      totals: { clicks: sum("clicks"), impressions: sum("impressions"), queries: rows.length },
      queries: rows.slice(0, 100).map((r) => ({ ...r, tracked: tracked.has(r.query.trim().toLowerCase()) })),
    };
  }
}
