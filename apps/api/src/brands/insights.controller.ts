import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { modelFromEnv } from "@avt/extraction";
import { type CloroProvider, providersFromEnv } from "@avt/providers";
import { type ContentBrief, fanoutToSuggestions, googleToSuggestions, searchConsoleToSuggestions, htmlToText, mergeSuggestions, suggestPromptsFromSite, writeBrief } from "@avt/insights";
import { CreateBrief, UpdateTodo } from "@avt/shared";
import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, ServiceUnavailableException } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { Jobs } from "../jobs";
import { ownedBrand } from "./brand-scope";
import { googleAccess } from "../integrations/google.controller";
import { gscQueries } from "../integrations/google";

class UpdateTodoDto extends createZodDto(UpdateTodo) {}
class CreateBriefDto extends createZodDto(CreateBrief) {}

const DAY = 24 * 3600 * 1000;
const BRIEF_CACHE = 7 * DAY;
const PRIORITY = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Action plan, site checkup, content briefs and prompt suggestions (handoff §10–11). */
@Controller("brands/:brandId")
export class InsightsController {
  private readonly model = modelFromEnv();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: Jobs,
  ) {}

  @Get("todos")
  async todos(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Query("status") status?: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const filter = status ? UpdateTodo.shape.status.safeParse(status) : null;
    if (filter && !filter.success) throw new BadRequestException("Unknown status");
    const todos = await this.prisma.todo.findMany({
      where: { brandId, ...(filter ? { status: filter.data } : {}) },
      orderBy: [{ gapPoints: "desc" }, { createdAt: "asc" }],
    });
    return todos.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority]);
  }

  @Patch("todos/:todoId")
  async updateTodo(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Param("todoId", ParseUUIDPipe) todoId: string, @Body() body: UpdateTodoDto) {
    await ownedBrand(this.prisma, ws, brandId);
    const { count } = await this.prisma.todo.updateMany({ where: { id: todoId, brandId }, data: { status: body.status } });
    if (!count) throw new NotFoundException();
    return this.prisma.todo.findUniqueOrThrow({ where: { id: todoId } });
  }

  /** Rebuilds the action plan in the background (it runs weekly on its own). */
  @Post("todos/generate")
  @HttpCode(202)
  async generate(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    await this.jobs.enqueue("insights", brandId);
    return { queued: true };
  }

  @Get("site-check")
  async siteCheck(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    // wrapped: a bare null would be sent as an empty body
    return { check: await this.prisma.siteCheck.findFirst({ where: { brandId }, orderBy: { checkedAt: "desc" } }) };
  }

  @Post("site-check")
  @HttpCode(202)
  async runSiteCheck(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    await this.jobs.enqueue("site-check", brandId);
    return { queued: true };
  }

  @Get("briefs")
  async briefs(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    return this.prisma.contentBrief.findMany({ where: { brandId }, orderBy: { generatedAt: "desc" }, include: { prompt: { select: { text: true } } } });
  }

  /** Content brief for one prompt, reused for 7 days unless `refresh` is set. */
  @Post("briefs")
  async createBrief(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: CreateBriefDto) {
    const brand = await ownedBrand(this.prisma, ws, brandId);
    const prompt = await this.prisma.prompt.findFirst({ where: { id: body.promptId, brandId, deletedAt: null } });
    if (!prompt) throw new NotFoundException("Unknown prompt");
    const cached = await this.prisma.contentBrief.findFirst({ where: { brandId, promptId: prompt.id }, orderBy: { generatedAt: "desc" } });
    if (cached && !body.refresh && Date.now() - cached.generatedAt.getTime() < BRIEF_CACHE) return cached;
    if (!this.model) throw new ServiceUnavailableException("No AI model is configured (EXTRACTION_MODEL + its API key)");

    const answers = await this.prisma.answer.findMany({
      where: { promptId: prompt.id, status: "OK", capturedAt: { gte: new Date(Date.now() - 90 * DAY) } },
      select: {
        mentions: { where: { rank: { gt: 0 } }, select: { entityId: true, score: true, summary: true, entity: { select: { canonicalName: true } } } },
        citations: { where: { searchResult: false }, select: { url: true, title: true } },
        fanout: { select: { query: true } },
      },
    });
    const rivals = new Map<string, { name: string; score: number; summary: string }>();
    for (const m of answers.flatMap((a) => a.mentions)) {
      if (m.entityId === brand.entityId) continue;
      const r = rivals.get(m.entityId) ?? { name: m.entity.canonicalName, score: 0, summary: m.summary };
      r.score += m.score;
      rivals.set(m.entityId, r);
    }
    const pages = Map.groupBy(answers.flatMap((a) => a.citations), (c) => c.url);
    const brief: ContentBrief = await writeBrief(this.model, {
      brand: { name: brand.name, domain: brand.domain, description: brand.description },
      prompt: prompt.text,
      competitors: [...rivals.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((r) => ({ name: r.name, summary: r.summary, visibility: Math.round(r.score / Math.max(1, answers.length)) })),
      citedPages: [...pages]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 10)
        .map(([url, cs]) => ({ url, title: cs.find((c) => c.title)?.title ?? null, count: cs.length })),
      fanout: [...new Set(answers.flatMap((a) => a.fanout.map((f) => f.query)))].slice(0, 15),
    });
    return this.prisma.contentBrief.create({ data: { brandId, promptId: prompt.id, status: "READY", body: brief as object, generatedAt: new Date() } });
  }

  /** New prompt ideas from the brand's website and the searches AI ran, minus near-duplicates (handoff §11). */
  @Post("prompts/suggest")
  async suggest(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: { google?: boolean } = {}) {
    const brand = await ownedBrand(this.prisma, ws, brandId);
    const existing = (await this.prisma.prompt.findMany({ where: { brandId, deletedAt: null }, select: { text: true } })).map((p) => p.text);
    const fanout = await this.prisma.fanoutQuery.findMany({
      where: { answer: { brandId, capturedAt: { gte: new Date(Date.now() - 90 * DAY) } } },
      select: { query: true },
      distinct: ["query"],
      take: 200,
    });

    let fromSite: { text: string; intent: "COMMERCIAL" | "INVESTIGATIONAL" | "INFORMATIONAL" | "NAVIGATIONAL" }[] = [];
    let note: string | null = null;
    if (!this.model) note = "No AI model is configured, so only searches AI already ran are suggested.";
    else {
      const res = await fetch(brand.websiteUrl, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; AIVisibilityTracker/1.0)" } }).catch(() => null);
      const html = res?.ok ? await res.text() : "";
      if (!html) note = `Couldn't read ${brand.websiteUrl}; suggestions come from AI searches only.`;
      else {
        fromSite = await suggestPromptsFromSite(this.model, { brand: brand.name, country: brand.country, siteText: htmlToText(html), existing }).catch(() => {
          note = "The AI model didn't respond; try again later.";
          return [];
        });
      }
    }
    const google = body.google ? await this.googleQuestions(brand) : { questions: [], related: [], note: null };
    // Search Console (free): the brand's own question-like search queries, when a property is linked
    const access = brand.gscProperty ? await googleAccess(this.prisma, ws.id).catch(() => null) : null;
    const gsc = access ? await gscQueries(access, brand.gscProperty!).catch(() => []) : [];
    const suggestions = mergeSuggestions(existing, [
      ...searchConsoleToSuggestions(gsc, brand.name).slice(0, 15),
      ...fromSite.map((s) => ({ ...s, source: "SUGGESTED" as const, origin: "site" as const })),
      ...googleToSuggestions(google.questions, google.related),
      ...fanoutToSuggestions(fanout.map((f) => f.query)),
    ]);
    return { suggestions, note: [note, google.note].filter(Boolean).join(" ") || null };
  }

  /**
   * Google "People also ask" + related searches for up to 3 of the brand's commercial prompts, through Cloro
   * (~5 credits a search). Respects the monthly credit budget and records the spend in ProviderUsage.
   */
  private async googleQuestions(brand: { id: string; country: string; language: string }) {
    const cloro = providersFromEnv().cloro as CloroProvider | undefined;
    if (!cloro) return { questions: [], related: [], note: "Google questions need a Cloro key." };
    const seeds = (await this.prisma.prompt.findMany({ where: { brandId: brand.id, deletedAt: null, isActive: true, intent: "COMMERCIAL" }, take: 3, orderBy: { createdAt: "asc" } })).map((p) => p.text);
    if (!seeds.length) return { questions: [], related: [], note: "Add a commercial prompt first; Google questions start from it." };

    const budget = Number(process.env.MONTHLY_CREDIT_BUDGET);
    if (Number.isFinite(budget) && budget > 0) {
      const now = new Date();
      const used = await this.prisma.providerUsage.aggregate({ _sum: { credits: true }, where: { day: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } } });
      if (Number(used._sum.credits ?? 0) + seeds.length * 5 > budget) return { questions: [], related: [], note: "Skipped Google questions: the monthly credit budget would be exceeded." };
    }

    const questions: string[] = [];
    const related: string[] = [];
    let credits = 0;
    let usd = 0;
    for (const seed of seeds) {
      const r = await cloro.searchQuestions(seed, brand.country, brand.language).catch(() => null);
      if (!r) continue;
      questions.push(...r.questions);
      related.push(...r.related);
      credits += r.credits;
      usd += r.usd;
    }
    if (credits) {
      const now = new Date();
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      await this.prisma.providerUsage.upsert({
        where: { day_provider_model: { day, provider: "cloro-serp", model: "google_aio" } },
        create: { day, provider: "cloro-serp", model: "google_aio", calls: seeds.length, credits, usd },
        update: { calls: { increment: seeds.length }, credits: { increment: credits }, usd: { increment: usd } },
      });
    }
    return { questions, related, note: credits ? `Google questions used ${credits} Cloro credits.` : "Google search didn't respond; try again later." };
  }
}
