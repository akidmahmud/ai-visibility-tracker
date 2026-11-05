import type { Intent, PrismaClient } from "@avt/db";
import type { modelFromEnv } from "@avt/extraction";
import {
  type Candidate,
  checkSite,
  type InsightInput,
  priorityOf,
  rank,
  runRules,
  SITE_CHECK_SUBJECTS,
  siteCheckCandidates,
  type SiteCheckResults,
  wordTodos,
} from "@avt/insights";
import { siteType } from "@avt/shared";

type LanguageModel = NonNullable<ReturnType<typeof modelFromEnv>>;

const RUNS = 4; // handoff §10: rules look at the last 4 runs
const WEEK = 7 * 24 * 3600 * 1000;

/** The numbers the rules need, from the brand's last 4 finished runs. null = no finished run yet. */
export async function insightInput(prisma: PrismaClient, brandId: string): Promise<InsightInput | null> {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
  const runs = await prisma.run.findMany({
    where: { brandId, status: { in: ["DONE", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    take: RUNS,
    select: { id: true },
  });
  if (!runs.length) return null;

  const [answers, prompts, siteCheck, classified] = await Promise.all([
    prisma.answer.findMany({
      where: { runId: { in: runs.map((r) => r.id) }, status: "OK" },
      select: {
        promptId: true,
        model: true,
        mentions: { select: { entityId: true, rank: true, score: true, sentiment: true, sentimentConfidence: true, summary: true } },
        citations: { where: { searchResult: false }, select: { domain: true } },
      },
    }),
    prisma.prompt.findMany({ where: { brandId, deletedAt: null, isActive: true }, include: { topic: true } }),
    prisma.siteCheck.findFirst({ where: { brandId }, orderBy: { checkedAt: "desc" } }),
    prisma.siteClassification.findMany(),
  ]);
  const self = brand.entityId;
  const typeOf = (d: string) => classified.find((c) => c.domain === d)?.siteType ?? siteType(d);
  const selfScore = (a: (typeof answers)[number]) => a.mentions.find((m) => m.entityId === self && m.rank > 0)?.score ?? 0;
  const vis = (as: typeof answers) => (as.length ? as.reduce((s, a) => s + selfScore(a), 0) / as.length : 0);

  const entityIds = [...new Set(answers.flatMap((a) => a.mentions.map((m) => m.entityId)))];
  const names = new Map((await prisma.entity.findMany({ where: { id: { in: entityIds } }, select: { id: true, canonicalName: true } })).map((e) => [e.id, e.canonicalName]));

  // topics: the brand's own grouping, or one "All prompts" cluster
  const topicOf = new Map(prompts.map((p) => [p.id, p.topic?.name ?? "All prompts"]));
  const topics = [...Map.groupBy(answers.filter((a) => topicOf.has(a.promptId)), (a) => topicOf.get(a.promptId)!)].map(([topic, as]) => {
    const rivalScores = new Map<string, number>();
    for (const a of as) for (const m of a.mentions) if (m.entityId !== self && m.rank > 0) rivalScores.set(m.entityId, (rivalScores.get(m.entityId) ?? 0) + m.score);
    const intents = prompts.filter((p) => topicOf.get(p.id) === topic).map((p) => p.intent);
    const intent = [...Map.groupBy(intents, (i) => i)].sort((x, y) => y[1].length - x[1].length)[0]?.[0] ?? ("COMMERCIAL" as Intent);
    return {
      topic,
      intent,
      you: vis(as),
      rivals: [...rivalScores].map(([id, sum]) => ({ name: names.get(id) ?? "Unknown", visibility: sum / as.length })),
    };
  });

  // domains cited when a rival is recommended but never when you are
  const withYou = new Set<string>();
  const gaps = new Map<string, { count: number; rivals: Set<string> }>();
  for (const a of answers) {
    const youRecommended = a.mentions.some((m) => m.entityId === self && m.rank > 0);
    const rivals = a.mentions.filter((m) => m.entityId !== self && m.rank > 0).map((m) => names.get(m.entityId) ?? "Unknown");
    for (const { domain } of a.citations) {
      if (domain === brand.domain) continue;
      if (youRecommended) withYou.add(domain);
      else if (rivals.length) {
        const g = gaps.get(domain) ?? { count: 0, rivals: new Set() };
        g.count++;
        rivals.forEach((r) => g.rivals.add(r));
        gaps.set(domain, g);
      }
    }
  }

  const allDomains = answers.flatMap((a) => a.citations.map((c) => c.domain));
  const byType = Map.groupBy(allDomains, typeOf);
  const topOfType = (t: string) => [...Map.groupBy(byType.get(t) ?? [], (d) => d)].sort((a, b) => b[1].length - a[1].length).map(([d]) => d);
  const selfMentions = answers.flatMap((a) => a.mentions.filter((m) => m.entityId === self && m.sentimentConfidence > 0));
  const negatives = selfMentions.filter((m) => m.sentiment === "NEGATIVE");

  return {
    brandName: brand.name,
    runs: runs.length,
    prompts: prompts.map((p) => {
      const as = answers.filter((a) => a.promptId === p.id);
      return { promptId: p.id, text: p.text, intent: p.intent, topic: p.topic?.name ?? null, answers: as.length, visibility: vis(as) };
    }),
    models: [...Map.groupBy(answers, (a) => a.model)].map(([model, as]) => ({ model, answers: as.length, visibility: vis(as) })),
    overallVisibility: vis(answers),
    topics,
    citedNotYou: [...gaps].filter(([d]) => !withYou.has(d)).map(([domain, g]) => ({ domain, count: g.count, rivals: [...g.rivals] })),
    siteTypeShare: Object.fromEntries([...byType].map(([t, ds]) => [t, ds.length / Math.max(1, allDomains.length)])),
    forumDomains: topOfType("Forums & Communities"),
    videoDomains: topOfType("Video"),
    negative: { pct: selfMentions.length ? negatives.length / selfMentions.length : 0, mentions: selfMentions.length, summaries: negatives.map((m) => m.summary).filter(Boolean) },
    siteCheck: (siteCheck?.results as SiteCheckResults | undefined) ?? null,
  };
}

/** Saves todos, keyed by rule + subject so the same gap stays one todo across weeks. Keeps the user's status. */
async function saveTodos(prisma: PrismaClient, brandId: string, todos: Candidate[]) {
  for (const t of todos) {
    const data = {
      title: t.title,
      detail: t.detail,
      priority: priorityOf(t).priority,
      effort: t.effort,
      gapPoints: t.gapPoints,
      type: t.type,
      category: t.category,
      models: t.models,
      evidence: t.evidence as object,
    };
    await prisma.todo.upsert({
      where: { brandId_ruleId_subject: { brandId, ruleId: t.ruleId, subject: t.subject } },
      update: data,
      create: { ...data, brandId, ruleId: t.ruleId, subject: t.subject, status: "SUGGESTED" },
    });
  }
}

/** Site-check todos whose check now passes are closed automatically (handoff §15, Phase 4). */
async function closePassingChecks(prisma: PrismaClient, brandId: string, results: SiteCheckResults) {
  if (!results.homepageReachable) return 0;
  const failing = new Set(siteCheckCandidates(results).map((c) => c.subject));
  const { count } = await prisma.todo.updateMany({
    where: { brandId, ruleId: "site-check", subject: { in: SITE_CHECK_SUBJECTS.filter((s) => !failing.has(s)) }, status: { in: ["SUGGESTED", "TODO"] } },
    data: { status: "DONE" },
  });
  return count;
}

/** Runs the site checkup, stores it, raises todos for failing checks and closes the ones that now pass. */
export async function runSiteCheck(prisma: PrismaClient, brandId: string, check = checkSite) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
  const results = await check(brand.websiteUrl);
  await prisma.siteCheck.create({ data: { brandId, checkedAt: new Date(results.checkedAt), results: results as object } });
  await saveTodos(prisma, brandId, siteCheckCandidates(results));
  const closed = await closePassingChecks(prisma, brandId, results);
  return { results, closed };
}

/** Weekly action plan: rules → top 15 → one LLM call for the wording → todos. */
export async function generateInsights(prisma: PrismaClient, model: LanguageModel | null, brandId: string, log?: (m: string, e?: Record<string, unknown>) => void) {
  const input = await insightInput(prisma, brandId);
  if (!input) return 0;
  const ranked = rank(runRules(input));
  const worded = await wordTodos(model, input.brandName, ranked).catch((e) => {
    log?.("todo wording failed, using rule text", { brandId, error: (e as Error).message });
    return ranked;
  });
  await saveTodos(prisma, brandId, worded);
  // untouched suggestions the numbers no longer support are archived; accepted or done items are the user's
  const current = new Set(worded.map((t) => `${t.ruleId}|${t.subject}`));
  const stale = (await prisma.todo.findMany({ where: { brandId, status: "SUGGESTED", ruleId: { not: "site-check" } }, select: { id: true, ruleId: true, subject: true } }))
    .filter((t) => !current.has(`${t.ruleId}|${t.subject}`));
  if (stale.length) await prisma.todo.updateMany({ where: { id: { in: stale.map((t) => t.id) } }, data: { status: "ARCHIVED" } });
  if (input.siteCheck) await closePassingChecks(prisma, brandId, input.siteCheck);
  await prisma.brand.update({ where: { id: brandId }, data: { insightsAt: new Date() } });
  return worded.length;
}

/** Scheduler: weekly action plans and site checks for brands that are due (a few per tick). */
export async function runDueInsights(prisma: PrismaClient, model: LanguageModel | null, log?: (m: string, e?: Record<string, unknown>) => void, now = new Date()) {
  const weekAgo = new Date(now.getTime() - WEEK);
  const brands = await prisma.brand.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, insightsAt: true } });
  let done = 0;
  for (const b of brands) {
    if (done >= 5) break;
    const lastCheck = await prisma.siteCheck.findFirst({ where: { brandId: b.id }, orderBy: { checkedAt: "desc" }, select: { checkedAt: true } });
    if (!lastCheck || lastCheck.checkedAt < weekAgo) {
      await runSiteCheck(prisma, b.id).catch((e) => log?.("site check failed", { brandId: b.id, error: (e as Error).message }));
      done++;
    }
    if (!b.insightsAt || b.insightsAt < weekAgo) {
      if (await generateInsights(prisma, model, b.id, log)) done++;
    }
  }
  return done;
}
