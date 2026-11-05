import { Prisma, type ModelTag, type PrismaClient } from "@avt/db";
import { type AnswerProvider, type CaptureResult, CLORO_SYNC_CREDITS, ProviderError } from "@avt/providers";
import { nextRunAt, normalizeDomain, QUEUE, siteType } from "@avt/shared";
import type { LlmExtractor } from "@avt/extraction";
import type { FlowProducer, Job } from "bullmq";
import { extractAnswer } from "./extract";
import type { RawStore } from "./raw-store";
import { daysOf, rollupDays } from "./rollup";

export type CaptureJob = { runId: string; promptId: string; model: ModelTag };
export type Route = { primary: string; fallback: string | null; enabled: boolean };

export interface Deps {
  prisma: PrismaClient;
  providers: Record<string, AnswerProvider>;
  raw: RawStore;
  flow: FlowProducer;
  extractor?: LlmExtractor | null; // null/undefined = deterministic extraction only (known entities)
  monthlyCreditBudget?: number; // undefined = no cap
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

// 3 attempts, then the answer is saved as FAILED so the run can finish as PARTIAL (handoff §5)
export const CAPTURE_ATTEMPTS = 3;
const BACKOFF_MS = [30_000, 120_000, 600_000];
export const captureBackoff = (attemptsMade: number) => BACKOFF_MS[Math.min(attemptsMade, BACKOFF_MS.length) - 1] ?? 600_000;

const DEFAULT_ROUTE: Route = { primary: "cloro", fallback: null, enabled: true };

// ponytail: routes cached in-process for 30s instead of Redis pub/sub invalidation; a switch applies within 30s.
let routeCache: { at: number; routes: Map<ModelTag, Route> } | null = null;
export async function getRoutes(prisma: PrismaClient): Promise<Map<ModelTag, Route>> {
  if (routeCache && Date.now() - routeCache.at < 30_000) return routeCache.routes;
  const rows = await prisma.providerRoute.findMany();
  routeCache = { at: Date.now(), routes: new Map(rows.map((r) => [r.model, r])) };
  return routeCache.routes;
}
export const clearRouteCache = () => (routeCache = null);
const routeFor = (routes: Map<ModelTag, Route>, model: ModelTag) =>
  routes.get(model) ?? (model === "claude" ? { ...DEFAULT_ROUTE, primary: "anthropic" } : DEFAULT_ROUTE);

function estimateCredits(promptCount: number, models: ModelTag[], routes: Map<ModelTag, Route>) {
  // only Cloro has a known per-call price; other providers bill in USD and are tracked after the fact
  const perPrompt = models.reduce((s, m) => s + (routeFor(routes, m).primary === "cloro" ? (CLORO_SYNC_CREDITS[m] ?? 0) : 0), 0);
  return promptCount * perPrompt;
}

async function creditsUsedThisMonth(prisma: PrismaClient, now: Date) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.providerUsage.aggregate({ _sum: { credits: true }, where: { day: { gte: monthStart } } });
  return Number(agg._sum.credits ?? 0);
}

/** Creates a Run and its capture flow. Returns null if the brand has nothing to run. */
export async function startRun(deps: Deps, brandId: string, now = new Date()) {
  const { prisma } = deps;
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, deletedAt: null, isActive: true },
    include: { prompts: { where: { isActive: true, deletedAt: null }, select: { id: true } } },
  });
  if (!brand) return null;
  await prisma.brand.update({ where: { id: brand.id }, data: { nextRunAt: nextRunAt(brand.frequency, now) } });

  const routes = await getRoutes(prisma);
  // the queue is the first provider in the route that has credentials; a job on a queue no worker
  // listens to would leave the run RUNNING forever
  const queueOf = (m: ModelTag) => {
    const r = routeFor(routes, m);
    return [r.primary, r.fallback].find((p): p is string => !!p && !!deps.providers[p]);
  };
  const skipped = brand.enabledModels.filter((m) => routeFor(routes, m).enabled && !queueOf(m));
  if (skipped.length) deps.log?.("engines skipped: no configured provider", { brandId, skipped });
  const models = brand.enabledModels.filter((m) => routeFor(routes, m).enabled && queueOf(m));
  if (!brand.prompts.length || !models.length) return null;

  if (deps.monthlyCreditBudget !== undefined) {
    const used = await creditsUsedThisMonth(prisma, now);
    const estimate = estimateCredits(brand.prompts.length, models, routes);
    if (used + estimate > deps.monthlyCreditBudget) {
      const note = `Skipped: monthly credit budget would be exceeded (used ${used} + estimated ${estimate} > ${deps.monthlyCreditBudget}).`;
      deps.log?.("budget guard blocked run", { brandId, used, estimate, budget: deps.monthlyCreditBudget });
      return prisma.run.create({ data: { brandId, scheduledFor: now, status: "FAILED", finishedAt: now, note } });
    }
  }

  const run = await prisma.run.create({
    data: { brandId, scheduledFor: now, status: "RUNNING", startedAt: now, promptCount: brand.prompts.length },
  });
  await deps.flow.add({
    name: "finalize",
    queueName: QUEUE.runs,
    data: { runId: run.id },
    opts: { jobId: `run_${run.id}` },
    children: brand.prompts.flatMap((p) =>
      models.map((model) => ({
        name: "capture",
        queueName: QUEUE.capture(queueOf(model)!),
        data: { runId: run.id, promptId: p.id, model } satisfies CaptureJob,
        opts: {
          jobId: `${run.id}_${p.id}_${model}`, // idempotency key runId:promptId:model (':' is reserved by BullMQ)
          attempts: CAPTURE_ATTEMPTS,
          backoff: { type: "custom" },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      })),
    ),
  });
  return run;
}

/** Capture processor. Never fails a job after its last attempt: it saves Answer FAILED instead, so the run can finish. */
export async function captureAnswer(deps: Deps, job: Pick<Job<CaptureJob>, "data" | "attemptsMade" | "opts">) {
  const { prisma } = deps;
  const { runId, promptId, model } = job.data;

  // idempotent: a re-delivered job must not create (or pay for) a second answer; it only finishes extraction
  const existing = await prisma.answer.findUnique({ where: { runId_promptId_model: { runId, promptId, model } } });
  if (existing) return existing.extractedAt ? existing.id : extractStep(deps, existing.id, job);

  const prompt = await prisma.prompt.findUniqueOrThrow({
    where: { id: promptId },
    include: { brand: { include: { competitors: { where: { deletedAt: null }, include: { entity: true } } } } },
  });
  const route = routeFor(await getRoutes(prisma), model);
  const req = {
    prompt: prompt.text,
    model,
    country: prompt.brand.country,
    language: prompt.brand.language,
    location: prompt.location ?? undefined,
    wantFanout: true,
  };

  const attempt = async (name: string) => {
    const provider = deps.providers[name];
    if (!provider?.supports(model)) throw new ProviderError(`provider "${name}" is not configured for ${model}`, false);
    return provider.capture(req);
  };

  let result: CaptureResult;
  try {
    result = await attempt(route.primary);
  } catch (e) {
    const err = e as ProviderError;
    const lastAttempt = err.retryable === false || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (!lastAttempt) throw e; // BullMQ retries with captureBackoff
    try {
      if (!route.fallback) throw e;
      result = await attempt(route.fallback);
    } catch (finalErr) {
      const error = (finalErr as Error).message;
      deps.log?.("capture failed", { runId, promptId, model, error });
      return saveAnswer(deps, job.data, prompt.brandId, null, route.primary, undefined, error);
    }
  }
  const answerId = await saveAnswer(deps, job.data, prompt.brandId, result, result.provider, {
    selfDomain: prompt.brand.domain,
    competitorDomains: new Set(prompt.brand.competitors.map((c) => c.entity.domain).filter((d): d is string => !!d)),
  });
  return extractStep(deps, answerId, job);
}

/** Extraction failures retry the job (the saved answer is reused); after the last attempt the sweep picks it up. */
async function extractStep(deps: Deps, answerId: string, job: Pick<Job<CaptureJob>, "attemptsMade" | "opts">) {
  try {
    await extractAnswer(deps.prisma, deps.extractor ?? null, answerId);
  } catch (e) {
    if (job.attemptsMade + 1 < (job.opts.attempts ?? 1)) throw e;
    deps.log?.("extraction failed, left for the sweep", { answerId, error: (e as Error).message });
  }
  return answerId;
}

/** Maintenance: extract answers whose extraction never finished (LLM outage, crash), then refresh their rollups. */
export async function extractPending(deps: Deps, now = new Date()) {
  const pending = await deps.prisma.answer.findMany({
    where: { status: "OK", extractedAt: null, capturedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    select: { id: true, brandId: true, capturedAt: true },
    take: 200,
  });
  for (const a of pending) {
    await extractAnswer(deps.prisma, deps.extractor ?? null, a.id).catch((e) =>
      deps.log?.("sweep extraction failed", { answerId: a.id, error: (e as Error).message }),
    );
  }
  const byBrand = Map.groupBy(pending, (a) => a.brandId);
  for (const [brandId, answers] of byBrand) await rollupDays(deps.prisma, brandId, daysOf(answers.map((a) => a.capturedAt)));
  return pending.length;
}

async function saveAnswer(
  deps: Deps,
  { runId, promptId, model }: CaptureJob,
  brandId: string,
  result: CaptureResult | null,
  provider: string,
  owners?: { selfDomain: string; competitorDomains: Set<string> },
  error?: string,
) {
  const { prisma } = deps;
  const now = new Date();
  const rawKey = result ? await deps.raw.put(`${runId}/${promptId}-${model}`, result.raw) : null;
  const ownerType = (domain: string) =>
    domain === owners?.selfDomain ? "SELF" : owners?.competitorDomains.has(domain) ? "COMPETITOR" : "THIRD_PARTY";

  try {
    const answer = await prisma.$transaction(async (tx) => {
      const a = await tx.answer.create({
        data: {
          runId,
          promptId,
          brandId,
          model,
          provider,
          status: result?.status ?? "FAILED",
          error: error?.slice(0, 1000),
          text: result?.text,
          rawKey,
          costCredits: result?.cost.credits,
          latencyMs: result?.latencyMs,
          capturedAt: now,
        },
      });
      if (result?.citations.length) {
        await tx.citation.createMany({
          data: result.citations.map((c) => {
            const domain = normalizeDomain(c.url) ?? c.url;
            return { answerId: a.id, brandId, url: c.url, domain, title: c.title, position: c.position, ownerType: ownerType(domain), siteType: siteType(domain), searchResult: c.searchResult ?? false };
          }),
        });
      }
      if (result?.fanout.length) {
        await tx.fanoutQuery.createMany({ data: result.fanout.map((f) => ({ answerId: a.id, ...f })) });
      }
      if (result) {
        const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const credits = result.cost.credits ?? 0;
        const usd = result.cost.usd ?? 0;
        await tx.providerUsage.upsert({
          where: { day_provider_model: { day, provider, model } },
          create: { day, provider, model, calls: 1, credits, usd },
          update: { calls: { increment: 1 }, credits: { increment: credits }, usd: { increment: usd } },
        });
      }
      return a;
    });
    return answer.id;
  } catch (e) {
    // a concurrent duplicate delivery won the race; keep its answer
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return (await prisma.answer.findUniqueOrThrow({ where: { runId_promptId_model: { runId, promptId, model } } })).id;
    }
    throw e;
  }
}

/** Parent job: runs once every capture child has finished. */
export async function finalizeRun(deps: Deps, runId: string) {
  const counts = await deps.prisma.answer.groupBy({ by: ["status"], where: { runId }, _count: true });
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const failed = n("FAILED");
  const answered = n("OK") + n("NO_AI_RESULT");
  const status = failed === 0 ? "DONE" : answered === 0 ? "FAILED" : "PARTIAL";
  // rollups first: the finished status is the signal that the run's numbers are ready to read
  const { brandId } = await deps.prisma.run.findUniqueOrThrow({ where: { id: runId }, select: { brandId: true } });
  const answers = await deps.prisma.answer.findMany({ where: { runId }, select: { capturedAt: true } });
  await rollupDays(deps.prisma, brandId, daysOf(answers.map((a) => a.capturedAt)));
  return deps.prisma.run.update({
    where: { id: runId },
    data: { status, finishedAt: new Date(), answerCount: answered, errorCount: failed },
  });
}

/** Scheduler tick: start runs for every brand whose nextRunAt has passed. */
export async function startDueRuns(deps: Deps, now = new Date()) {
  const due = await deps.prisma.brand.findMany({
    where: { isActive: true, deletedAt: null, nextRunAt: { lte: now } },
    select: { id: true },
    take: 100,
  });
  for (const b of due) await startRun(deps, b.id, now);
  return due.length;
}
