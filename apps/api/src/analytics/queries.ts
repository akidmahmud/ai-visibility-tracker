import type { Brand, Intent, ModelTag, PrismaClient } from "@avt/db";
import { Intent as IntentSchema, ModelTag as ModelTagSchema, pageType, siteType, trend } from "@avt/shared";
import { BadRequestException, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

// Dashboard reads. Aggregates come from rollup tables only (handoff §4); raw rows are read only for lists of
// individual answers. Shared by the signed-in API and the public share-link report.
//
// Unfiltered numbers read DailyRollup. When topics or intents are picked, the same numbers come from
// DailyPromptRollup limited to those prompts, with the brand's own rows as the denominator.

const DAY = 24 * 3600 * 1000;
const ratio = (a: number, b: number) => (b ? a / b : null);

export type Filters = { days: number; models: ModelTag[] | null; topics: string[] | null; intents: Intent[] | null };

export function parseFilters(days?: string, models?: string, topics?: string, intents?: string): Filters {
  const list = (s?: string) => (s ? s.split(",").filter(Boolean) : []);
  const m = list(models).map((x) => ModelTagSchema.safeParse(x));
  const i = list(intents).map((x) => IntentSchema.safeParse(x));
  if (m.some((x) => !x.success)) throw new BadRequestException("Unknown engine in models");
  if (i.some((x) => !x.success)) throw new BadRequestException("Unknown intent in intents");
  const t = list(topics);
  return {
    days: Math.min(Math.max(Number(days ?? 30) || 30, 1), 365),
    models: m.length ? m.map((x) => x.data as ModelTag) : null,
    topics: t.length ? t : null,
    intents: i.length ? i.map((x) => x.data as Intent) : null,
  };
}

/** Route param: the dashboard filters from ?days&models&topics&intents. */
export const QueryFilters = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const q = ctx.switchToHttp().getRequest<Request>().query as Record<string, string | undefined>;
  return parseFilters(q.days, q.models, q.topics, q.intents);
});

const since = (f: Filters) => new Date(new Date(Date.now() - f.days * DAY).toISOString().slice(0, 10));
const scope = (brandId: string, f: Filters) => ({ brandId, day: { gte: since(f) }, ...(f.models ? { model: { in: f.models } } : {}) });

/** Prompt ids matching the topic/intent filters, or null when neither is set. */
async function promptScope(prisma: PrismaClient, brandId: string, f: Filters): Promise<string[] | null> {
  if (!f.topics && !f.intents) return null;
  const rows = await prisma.prompt.findMany({
    where: { brandId, ...(f.topics ? { topicId: { in: f.topics } } : {}), ...(f.intents ? { intent: { in: f.intents } } : {}) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

type Key = "entityId" | "day" | "model";
type Sums = { answers: number; noAiResult: number; mentions: number; scoreSum: number; rankSum: number; positive: number; neutral: number; negative: number };
type Row = Sums & { entityId?: string; day?: Date; model?: ModelTag };
const ZERO: Sums = { answers: 0, noAiResult: 0, mentions: 0, scoreSum: 0, rankSum: 0, positive: 0, neutral: 0, negative: 0 };
const SUMS = { answers: true, noAiResult: true, mentions: true, scoreSum: true, rankSum: true, positive: true, neutral: true, negative: true } as const;
const sums = (s: Partial<Record<keyof Sums, number | null>>): Sums =>
  Object.fromEntries(Object.keys(ZERO).map((k) => [k, s[k as keyof Sums] ?? 0])) as Sums;

/**
 * Entity totals grouped by `by`. `answers`/`noAiResult` are always the brand's denominator for the same
 * group, so visibility = scoreSum / answers for every entity.
 */
async function totals(prisma: PrismaClient, brand: Brand, f: Filters, by: Key[], entityIds?: string[]): Promise<Row[]> {
  const where = { ...scope(brand.id, f), ...(entityIds ? { entityId: { in: entityIds } } : {}) };
  const prompts = await promptScope(prisma, brand.id, f);
  if (!prompts) {
    const rows = await prisma.dailyRollup.groupBy({ by, where, _sum: SUMS });
    return rows.map((r) => ({ ...r, ...sums(r._sum) }));
  }
  if (!brand.entityId || !prompts.length) return [];
  const pScope = { ...where, promptId: { in: prompts } };
  const denomBy = by.filter((k) => k !== "entityId");
  const [rows, denoms] = await Promise.all([
    prisma.dailyPromptRollup.groupBy({ by, where: pScope, _sum: SUMS }),
    prisma.dailyPromptRollup.groupBy({
      by: denomBy.length ? denomBy : ["entityId"],
      where: { ...scope(brand.id, f), promptId: { in: prompts }, entityId: brand.entityId },
      _sum: { answers: true, noAiResult: true },
    }),
  ]);
  const keyOf = (r: { day?: Date; model?: ModelTag }) => denomBy.map((k) => (k === "day" ? r.day?.toISOString() : r[k])).join("|");
  const denom = new Map(denoms.map((d) => [keyOf(d as { day?: Date; model?: ModelTag }), d._sum]));
  return rows.map((r) => {
    const d = denom.get(keyOf(r as { day?: Date; model?: ModelTag }));
    return { ...r, ...sums(r._sum), answers: d?.answers ?? 0, noAiResult: d?.noAiResult ?? 0 };
  });
}

async function entityNames(prisma: PrismaClient, ids: string[]) {
  const rows = await prisma.entity.findMany({ where: { id: { in: ids } }, select: { id: true, canonicalName: true, domain: true } });
  return new Map(rows.map((e) => [e.id, e]));
}

async function trackedIds(prisma: PrismaClient, brandId: string) {
  return new Set((await prisma.competitor.findMany({ where: { brandId, deletedAt: null }, select: { entityId: true } })).map((c) => c.entityId));
}

type Kind = "SELF" | "COMPETITOR" | "UNTRACKED";

/** Headline numbers for the brand plus every entity ranked by visibility. */
export async function summary(prisma: PrismaClient, brand: Brand, f: Filters) {
  const [byEntity, byDay, tracked] = await Promise.all([
    totals(prisma, brand, f, ["entityId"]),
    brand.entityId ? totals(prisma, brand, f, ["day"], [brand.entityId]) : [],
    trackedIds(prisma, brand.id),
  ]);
  // tracked competitors with no mentions still belong on the board, at 0
  const denominator = byEntity.find((e) => e.entityId === brand.entityId) ?? byEntity[0];
  for (const id of [...tracked, ...(brand.entityId ? [brand.entityId] : [])]) {
    if (denominator && !byEntity.some((e) => e.entityId === id)) byEntity.push({ ...ZERO, entityId: id, answers: denominator.answers, noAiResult: denominator.noAiResult });
  }
  const names = await entityNames(prisma, byEntity.map((e) => e.entityId!));
  const totalMentions = byEntity.reduce((s, e) => s + e.mentions, 0);

  const entities = byEntity
    .map((s) => {
      const entityId = s.entityId!;
      const sentiments = s.positive + s.neutral + s.negative;
      const kind: Kind = entityId === brand.entityId ? "SELF" : tracked.has(entityId) ? "COMPETITOR" : "UNTRACKED";
      return {
        entityId,
        name: kind === "SELF" ? brand.name : (names.get(entityId)?.canonicalName ?? "Unknown"),
        domain: names.get(entityId)?.domain ?? null,
        kind,
        answers: s.answers,
        noAiResult: s.noAiResult,
        mentions: s.mentions,
        visibility: ratio(s.scoreSum, s.answers),
        mentionRate: ratio(s.mentions, s.answers),
        avgPosition: ratio(s.rankSum, s.mentions),
        sentimentPct: ratio(s.positive, sentiments),
        negativePct: ratio(s.negative, sentiments),
        shareOfVoice: ratio(s.mentions, totalMentions),
      };
    })
    .filter((e) => e.kind !== "UNTRACKED" || e.mentions > 0)
    .sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0) || b.mentions - a.mentions);

  const self = entities.find((e) => e.kind === "SELF") ?? null;
  const series = byDay.sort((a, b) => a.day!.getTime() - b.day!.getTime()).map((d) => ratio(d.scoreSum, d.answers) ?? 0);
  return {
    days: f.days,
    brand: self && { ...self, aiResultRate: ratio(self.answers, self.answers + self.noAiResult), trend: trend(series) },
    entities,
  };
}

/** Visibility per day for the brand and its top 4 rivals, plus the dates a capture provider was switched. */
export async function timeseries(prisma: PrismaClient, brand: Brand, f: Filters) {
  const { entities } = await summary(prisma, brand, f);
  const shown = [...entities.filter((e) => e.kind === "SELF"), ...entities.filter((e) => e.kind !== "SELF").slice(0, 4)];
  const rows = await totals(prisma, brand, f, ["entityId", "day"], shown.map((e) => e.entityId));
  const days = [...new Set(rows.map((r) => r.day!.toISOString().slice(0, 10)))].sort();
  const changes = await prisma.auditLog.findMany({
    where: { action: "provider-route.update", createdAt: { gte: since(f) }, ...(f.models ? { target: { in: f.models } } : {}) },
    select: { createdAt: true, target: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    days,
    series: shown.map((e) => ({
      entityId: e.entityId,
      name: e.name,
      kind: e.kind,
      points: days.map((day) => {
        const r = rows.find((x) => x.entityId === e.entityId && x.day!.toISOString().slice(0, 10) === day);
        return { day, visibility: r ? ratio(r.scoreSum, r.answers) : null };
      }),
    })),
    providerChanges: changes.map((c) => ({ day: c.createdAt.toISOString().slice(0, 10), model: c.target })),
    // Peekaboo's own score for the brand, when imported: shown beside ours during the parallel run (§17.3)
    peekaboo: (await prisma.peekabooBaseline.findMany({ where: { brandId: brand.id, day: { gte: since(f) } }, orderBy: { day: "asc" } })).map((b) => ({
      day: b.day.toISOString().slice(0, 10),
      score: b.score,
    })),
  };
}

/** Visibility of the top entities on each engine (entity × model). */
export async function heatmap(prisma: PrismaClient, brand: Brand, f: Filters) {
  const { entities } = await summary(prisma, brand, f);
  const top = entities.slice(0, 10);
  const rows = await totals(prisma, brand, f, ["entityId", "model"], top.map((e) => e.entityId));
  const models = [...new Set(rows.filter((r) => r.answers > 0).map((r) => r.model!))];
  return {
    models,
    rows: top.map((e) => ({
      entityId: e.entityId,
      name: e.name,
      kind: e.kind,
      cells: models.map((model) => {
        const r = rows.find((x) => x.entityId === e.entityId && x.model === model);
        return { model, visibility: r ? ratio(r.scoreSum, r.answers) : null };
      }),
    })),
  };
}

/** Every prompt with the brand's numbers on it, and the visibility of the brand + top 4 rivals per prompt. */
export async function prompts(prisma: PrismaClient, brand: Brand, f: Filters) {
  const ids = await promptScope(prisma, brand.id, f);
  const [list, rows, { entities }] = await Promise.all([
    prisma.prompt.findMany({
      where: { brandId: brand.id, deletedAt: null, ...(ids ? { id: { in: ids } } : {}) },
      include: { topic: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.dailyPromptRollup.groupBy({
      by: ["promptId", "entityId"],
      where: { ...scope(brand.id, f), ...(ids ? { promptId: { in: ids } } : {}) },
      _sum: { answers: true, mentions: true, scoreSum: true, rankSum: true, citations: true },
    }),
    summary(prisma, brand, f),
  ]);
  const top = [...entities.filter((e) => e.kind === "SELF"), ...entities.filter((e) => e.kind !== "SELF")].slice(0, 5);
  const selfRow = (promptId: string) => rows.find((r) => r.promptId === promptId && r.entityId === brand.entityId);
  return {
    columns: top.map((e) => ({ entityId: e.entityId, name: e.name, kind: e.kind })),
    prompts: list.map((p) => {
      const s = selfRow(p.id)?._sum;
      const answers = s?.answers ?? 0;
      return {
        id: p.id,
        text: p.text,
        intent: p.intent,
        topicId: p.topicId,
        topic: p.topic?.name ?? null,
        location: p.location,
        isActive: p.isActive,
        answers,
        citations: s?.citations ?? 0,
        visibility: ratio(s?.scoreSum ?? 0, answers),
        mentionRate: ratio(s?.mentions ?? 0, answers),
        avgPosition: ratio(s?.rankSum ?? 0, s?.mentions ?? 0),
        matrix: top.map((e) => {
          const r = rows.find((x) => x.promptId === p.id && x.entityId === e.entityId)?._sum;
          return answers ? ratio(r?.scoreSum ?? 0, answers) : null;
        }),
      };
    }),
  };
}

/** Site type per domain: the stored classification (LLM or list), else the fixed list. */
async function siteTypes(prisma: PrismaClient, domains: string[]) {
  const rows = await prisma.siteClassification.findMany({ where: { domain: { in: domains } } });
  const stored = new Map(rows.map((r) => [r.domain, r.siteType]));
  return (domain: string) => stored.get(domain) ?? siteType(domain);
}

/** Cited sites (or individual pages) with owner, site/page type, per-engine counts, answers citing them, and a top-5 daily trend. */
export async function sources(prisma: PrismaClient, brand: Brand, f: Filters, view: "domains" | "urls" = "domains", promptId?: string) {
  const ids = await promptScope(prisma, brand.id, f);
  const where = { ...scope(brand.id, f), ...(ids ? { promptId: { in: ids } } : {}), ...(promptId ? { promptId } : {}) };
  const [rows, competitors] = await Promise.all([
    prisma.dailyCitationRollup.groupBy({ by: ["url", "domain", "model", "promptId", "day"], where, _sum: { count: true, searchCount: true }, _max: { title: true } }),
    prisma.competitor.findMany({ where: { brandId: brand.id, deletedAt: null }, include: { entity: { select: { domain: true } } } }),
  ]);
  const competitorDomains = new Set(competitors.map((c) => c.entity.domain).filter(Boolean));
  const typeOf = await siteTypes(prisma, [...new Set(rows.map((r) => r.domain))]);
  const total = rows.reduce((s, r) => s + (r._sum.count ?? 0), 0);
  const keyOf = (r: (typeof rows)[number]) => (view === "urls" ? r.url : r.domain);
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);

  const items = [...Map.groupBy(rows, keyOf).entries()]
    .map(([k, rs]) => {
      const domain = rs[0]!.domain;
      const count = rs.reduce((s, r) => s + (r._sum.count ?? 0), 0);
      const perModel = Map.groupBy(rs, (r) => r.model);
      const title = view === "urls" ? (rs.map((r) => r._max.title).find(Boolean) ?? null) : null;
      return {
        domain,
        url: view === "urls" ? k : null,
        title,
        count,
        // citations that were Google blue links rather than pages the AI cited
        searchCount: rs.reduce((s, r) => s + (r._sum.searchCount ?? 0), 0),
        share: ratio(count, total),
        // one rollup row per prompt × engine × day ≈ one AI answer that cited it
        answers: new Set(rs.map((r) => `${r.promptId}|${r.model}|${dayOf(r.day)}`)).size,
        lastSeen: dayOf(rs.reduce((m, r) => (r.day > m ? r.day : m), rs[0]!.day)),
        owner: domain === brand.domain ? "SELF" : competitorDomains.has(domain) ? "COMPETITOR" : "THIRD_PARTY",
        siteType: typeOf(domain),
        pageType: view === "urls" ? pageType(k, title, domain) : null,
        byModel: Object.fromEntries([...perModel].map(([m, ms]) => [m, ms.reduce((s, r) => s + (r._sum.count ?? 0), 0)])),
      };
    })
    .sort((a, b) => b.count - a.count);
  const breakdown = (key: "siteType" | "pageType") =>
    Object.entries(Object.groupBy(items, (d) => d[key] ?? "Other"))
      .map(([type, ds]) => ({ type, count: (ds ?? []).reduce((s, d) => s + d.count, 0) }))
      .sort((a, b) => b.count - a.count);
  const top = new Set(items.slice(0, 5).map((i) => i.url ?? i.domain));
  const trend = [...Map.groupBy(rows.filter((r) => top.has(keyOf(r))), (r) => `${dayOf(r.day)}|${keyOf(r)}`)].map(([k, rs]) => {
    const [day, key] = k.split(/\|(.*)/s) as [string, string];
    return { day, key, count: rs.reduce((s, r) => s + (r._sum.count ?? 0), 0) };
  });
  const searchTotal = rows.reduce((s, r) => s + (r._sum.searchCount ?? 0), 0);
  return { total, searchTotal, view, domains: items, bySiteType: breakdown("siteType"), byPageType: view === "urls" ? breakdown("pageType") : [], trend };
}

/** The individual AI answers (raw chats), newest first. */
export async function answers(
  prisma: PrismaClient,
  brand: Brand,
  f: Filters,
  q: { promptId?: string; mentioned?: "yes" | "no"; page: number },
) {
  const pageSize = 25;
  const ids = await promptScope(prisma, brand.id, f);
  const where = {
    brandId: brand.id,
    capturedAt: { gte: since(f) },
    ...(f.models ? { model: { in: f.models } } : {}),
    ...(q.promptId ? { promptId: q.promptId } : ids ? { promptId: { in: ids } } : {}),
    ...(q.mentioned && brand.entityId
      ? { mentions: q.mentioned === "yes" ? { some: { entityId: brand.entityId, rank: { gt: 0 } } } : { none: { entityId: brand.entityId, rank: { gt: 0 } } } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.answer.count({ where }),
    prisma.answer.findMany({
      where,
      orderBy: { capturedAt: "desc" },
      skip: (q.page - 1) * pageSize,
      take: pageSize,
      include: {
        prompt: { select: { text: true } },
        mentions: brand.entityId ? { where: { entityId: brand.entityId }, select: { rank: true, totalInAnswer: true } } : false,
        _count: { select: { citations: { where: { searchResult: false } } } },
      },
    }),
  ]);
  return {
    total,
    page: q.page,
    pageSize,
    answers: rows.map((a) => ({
      id: a.id,
      model: a.model,
      status: a.status,
      provider: a.provider,
      prompt: a.prompt.text,
      capturedAt: a.capturedAt,
      excerpt: a.text?.slice(0, 220) ?? null,
      citations: a._count.citations,
      selfRank: (a.mentions as { rank: number; totalInAnswer: number }[] | undefined)?.[0]?.rank || null,
    })),
  };
}

/** One answer in full: text, every mention, citations and fan-out queries. */
export async function answerDetail(prisma: PrismaClient, brand: Brand, answerId: string) {
  const a = await prisma.answer.findFirst({
    where: { id: answerId, brandId: brand.id },
    include: {
      prompt: { select: { id: true, text: true } },
      mentions: { include: { entity: { select: { canonicalName: true, domain: true } } }, orderBy: [{ rank: "asc" }] },
      citations: { orderBy: { position: "asc" } },
      fanout: { orderBy: { sequence: "asc" } },
    },
  });
  if (!a) return null;
  const tracked = await trackedIds(prisma, brand.id);
  return {
    ...a,
    mentions: a.mentions
      .map((m) => ({
        entityId: m.entityId,
        name: m.entityId === brand.entityId ? brand.name : m.entity.canonicalName,
        kind: (m.entityId === brand.entityId ? "SELF" : tracked.has(m.entityId) ? "COMPETITOR" : "UNTRACKED") as Kind,
        rank: m.rank,
        totalInAnswer: m.totalInAnswer,
        score: m.score,
        sentiment: m.sentimentConfidence > 0 ? m.sentiment : null,
        summary: m.summary,
      }))
      .sort((x, y) => (x.rank || 99) - (y.rank || 99)),
  };
}

/** One cited URL: every answer in the period that cited it, with the prompt and the position it was cited at. */
export async function sourceDetail(prisma: PrismaClient, brand: Brand, f: Filters, url: string) {
  const ids = await promptScope(prisma, brand.id, f);
  const since = new Date(Date.now() - f.days * 24 * 3600 * 1000);
  const citations = await prisma.citation.findMany({
    where: {
      brandId: brand.id,
      url,
      answer: { capturedAt: { gte: since }, ...(f.models?.length ? { model: { in: f.models as never } } : {}), ...(ids ? { promptId: { in: ids } } : {}) },
    },
    orderBy: { answer: { capturedAt: "desc" } },
    take: 200,
    select: { position: true, title: true, domain: true, searchResult: true, answer: { select: { id: true, model: true, capturedAt: true, prompt: { select: { id: true, text: true } } } } },
  });
  return {
    url,
    title: citations.find((c) => c.title)?.title ?? null,
    domain: citations[0]?.domain ?? null,
    pageType: pageType(url, citations.find((c) => c.title)?.title, citations[0]?.domain),
    citations: citations.map((c) => ({ answerId: c.answer.id, model: c.answer.model, capturedAt: c.answer.capturedAt, prompt: c.answer.prompt, position: c.position, searchResult: c.searchResult })),
  };
}
