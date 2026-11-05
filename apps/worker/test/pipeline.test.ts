import { createPrisma, type ModelTag } from "@avt/db";
import { type AnswerProvider, type CaptureRequest, ProviderError } from "@avt/providers";
import { normalizeName, QUEUE } from "@avt/shared";
import { FlowProducer, Worker } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveEntity } from "../src/entities";
import { generateInsights, insightInput, runSiteCheck } from "../src/insights";
import { captureAnswer, clearRouteCache, type Deps, finalizeRun, startRun } from "../src/pipeline";
import { RawStore } from "../src/raw-store";

// Phase 1 acceptance (handoff §15) against real Postgres + Redis/BullMQ, with a fake provider standing in for Cloro.
const prisma = createPrisma();
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const prefix = `test-${randomUUID()}`; // isolates this test's queues in Redis

const MODELS: ModelTag[] = ["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode"];
const calls: string[] = [];
let flakyOnce = true;

const fake: AnswerProvider = {
  name: "cloro",
  supports: () => true,
  async capture(r: CaptureRequest) {
    calls.push(`${r.model}:${r.prompt}`);
    // like Cloro today: Perplexity unavailable, not retryable
    if (r.model === "perplexity") throw new ProviderError("cloro 400 MODEL_UNAVAILABLE", false, "MODEL_UNAVAILABLE", 400);
    // one transient failure that a retry fixes
    if (r.model === "gemini" && r.prompt === "prompt 0" && flakyOnce) {
      flakyOnce = false;
      throw new ProviderError("cloro 503", true);
    }
    return {
      status: r.model === "google_aio" && r.prompt === "prompt 1" ? "NO_AI_RESULT" : "OK",
      text: "Acme Law and Rival LLP are good choices.",
      citations: [
        { url: "https://acmelaw.com/about", position: 1 },
        { url: "https://www.rival.com/", position: 2 },
        { url: "https://reddit.com/r/law", position: 3 },
      ],
      fanout: r.model === "chatgpt" ? [{ query: "acme law reviews", kind: "WEB", sequence: 1 }] : [],
      raw: { prompt: r.prompt },
      cost: { credits: 5, usd: 0.002 },
      provider: "cloro",
    };
  },
};

let deps: Deps;
let workers: Worker[] = [];
let brandId: string;

async function waitForRun(runId: string) {
  for (let i = 0; i < 200; i++) {
    const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== "RUNNING") return run;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("run never finished");
}

beforeAll(async () => {
  clearRouteCache();
  await prisma.providerRoute.deleteMany(); // default routing: everything → cloro
  deps = {
    prisma,
    providers: { cloro: fake },
    raw: new RawStore(mkdtempSync(join(tmpdir(), "avt-raw-"))),
    flow: new FlowProducer({ connection, prefix }),
  };
  workers = [
    new Worker(QUEUE.capture("cloro"), (job) => captureAnswer(deps, job), {
      connection,
      prefix,
      concurrency: 5,
      settings: { backoffStrategy: () => 10 }, // fast retries for the test
    }),
    new Worker(QUEUE.runs, (job) => finalizeRun(deps, job.data.runId), { connection, prefix }),
  ];

  const orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "Test Agency", slug: orgId } });
  const ws = await prisma.workspace.create({ data: { organizationId: orgId, name: "Test Agency" } });
  const rival = await prisma.entity.create({ data: { canonicalName: "Rival LLP", domain: `rival-${orgId}.com` } });
  const brand = await prisma.brand.create({
    data: {
      workspaceId: ws.id,
      name: "Acme Law",
      websiteUrl: "https://acmelaw.com",
      domain: "acmelaw.com",
      enabledModels: MODELS,
      prompts: { create: Array.from({ length: 10 }, (_, i) => ({ text: `prompt ${i}`, intent: "COMMERCIAL" as const })) },
    },
  });
  await prisma.competitor.create({ data: { brandId: brand.id, entityId: rival.id, isTracked: true } });
  brandId = brand.id;
});

afterAll(async () => {
  await Promise.all(workers.map((w) => w.close()));
  await deps.flow.close();
  connection.disconnect();
  await prisma.$disconnect();
});

describe("run pipeline", () => {
  it("10 prompts × 5 engines → 50 answers; a down engine ends the run PARTIAL, not stuck", async () => {
    const started = await startRun(deps, brandId);
    expect(started?.status).toBe("RUNNING");
    const run = await waitForRun(started!.id);

    expect(run).toMatchObject({ status: "PARTIAL", promptCount: 10, answerCount: 40, errorCount: 10 });
    const answers = await prisma.answer.findMany({ where: { runId: run.id } });
    expect(answers).toHaveLength(50);
    expect(answers.filter((a) => a.status === "FAILED").every((a) => a.model === "perplexity")).toBe(true);
    expect(answers.filter((a) => a.status === "NO_AI_RESULT")).toHaveLength(1);

    // perplexity was not retried (non-retryable); the flaky gemini call was retried once
    expect(calls.filter((c) => c.startsWith("perplexity:"))).toHaveLength(10);
    expect(calls.filter((c) => c === "gemini:prompt 0")).toHaveLength(2);

    // credits recorded per answer and in daily usage
    const ok = answers.filter((a) => a.status !== "FAILED");
    expect(ok.every((a) => Number(a.costCredits) === 5)).toBe(true);
    const usage = await prisma.providerUsage.aggregate({ _sum: { calls: true }, where: { provider: "cloro" } });
    expect(usage._sum.calls).toBeGreaterThanOrEqual(40);

    // citations classified by owner; fan-out saved; raw payload stored
    const cites = await prisma.citation.findMany({ where: { answerId: answers.find((a) => a.model === "chatgpt")!.id }, orderBy: { position: "asc" } });
    expect(cites.map((c) => [c.domain, c.ownerType])).toEqual([
      ["acmelaw.com", "SELF"],
      ["rival.com", "THIRD_PARTY"], // entity domain is rival-<id>.com in this test, so rival.com is not the competitor
      ["reddit.com", "THIRD_PARTY"],
    ]);
    expect(await prisma.fanoutQuery.count({ where: { answer: { runId: run.id } } })).toBe(10);
    expect(ok.every((a) => a.rawKey)).toBe(true);

    // the brand is rescheduled about a week out
    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
    expect(brand.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);

    // extraction (no LLM key → known entities only): "Acme Law and Rival LLP are good choices."
    const chatgpt = answers.find((a) => a.model === "chatgpt")!;
    const mentions = await prisma.mention.findMany({ where: { answerId: chatgpt.id }, orderBy: { rank: "asc" } });
    expect(mentions.map((m) => [m.kind, m.rank, m.totalInAnswer, m.score])).toEqual([
      ["SELF", 1, 2, 100],
      ["COMPETITOR", 2, 2, 50],
    ]);
    expect(brand.entityId).toBe(mentions[0]!.entityId);
    expect(ok.every((a) => a.extractedAt)).toBe(true);

    // rollups: one row per tracked entity × model × day, OK answers as the denominator
    const day = new Date(chatgpt.capturedAt.toISOString().slice(0, 10));
    const self = await prisma.dailyRollup.findMany({ where: { brandId, entityId: brand.entityId!, day } });
    const byModel = Object.fromEntries(self.map((r) => [r.model, r]));
    expect(byModel.chatgpt).toMatchObject({ answers: 10, noAiResult: 0, mentions: 10, scoreSum: 1000, rankSum: 10 });
    expect(byModel.google_aio).toMatchObject({ answers: 9, noAiResult: 1, mentions: 9, scoreSum: 900 });
    expect(byModel.perplexity).toMatchObject({ answers: 0, mentions: 0 }); // all failed: excluded from visibility
    const rival = await prisma.dailyRollup.findFirstOrThrow({ where: { brandId, model: "chatgpt", day, entityId: { not: brand.entityId! } } });
    expect(rival).toMatchObject({ answers: 10, mentions: 10, scoreSum: 500, rankSum: 20 });
    const promptRows = await prisma.dailyPromptRollup.findMany({ where: { brandId, model: "chatgpt", day, entityId: brand.entityId! } });
    expect(promptRows).toHaveLength(10); // one self row per prompt
    expect(promptRows.every((r) => r.answers === 1 && r.scoreSum === 100 && r.citations === 3)).toBe(true);
    expect(await prisma.dailyPromptRollup.count({ where: { brandId, model: "chatgpt", day } })).toBe(20); // + rival where mentioned

    const citeRollup = await prisma.dailyCitationRollup.groupBy({ by: ["domain"], where: { brandId, model: "chatgpt", day }, _sum: { count: true } });
    expect(await prisma.dailyCitationRollup.count({ where: { brandId, model: "chatgpt", day } })).toBe(30); // 10 prompts × 3 pages
    expect(citeRollup.map((c) => [c.domain, c._sum.count]).sort()).toEqual([["acmelaw.com", 10], ["reddit.com", 10], ["rival.com", 10]]);
  });

  it("entity resolution merges fuzzy names only within the brand's own entities", async () => {
    const name = `Clifford Law Offices ${randomUUID().slice(0, 6)}`;
    const clifford = await prisma.entity.create({ data: { canonicalName: name } });
    const scope = [{ entityId: clifford.id, normalized: [normalizeName(name)] }];

    expect(await resolveEntity(prisma, name.replace("Offices", "Office"), null, scope)).toBe(clifford.id); // fuzzy, in scope
    expect(await resolveEntity(prisma, name.replace("Offices", "Office"), null, [])).toBe(clifford.id); // that added an alias

    const unique = `Zeta ${randomUUID().slice(0, 8)}`;
    const a = await resolveEntity(prisma, unique, null, []);
    const b = await resolveEntity(prisma, `${unique}s`, null, []); // close, but not in this brand's scope → new entity
    expect(a).not.toBe(b);
  });

  it("re-delivering a capture job does not create or pay for a second answer", async () => {
    const answer = await prisma.answer.findFirstOrThrow({ where: { brandId, model: "chatgpt" } });
    const before = calls.length;
    const id = await captureAnswer(deps, { data: { runId: answer.runId, promptId: answer.promptId, model: "chatgpt" }, attemptsMade: 0, opts: { attempts: 3 } });
    expect(id).toBe(answer.id);
    expect(calls.length).toBe(before);
  });

  it("an engine routed to a provider without credentials is left out, so the run still finishes", async () => {
    await prisma.providerRoute.create({ data: { model: "google_aio", primary: "dataforseo", updatedBy: "test" } });
    clearRouteCache();
    try {
      const run = await waitForRun((await startRun(deps, brandId))!.id);
      const models = new Set((await prisma.answer.findMany({ where: { runId: run.id } })).map((a) => a.model));
      expect(models.has("google_aio")).toBe(false);
      expect(models.size).toBe(4);
      const failed = await prisma.answer.findFirstOrThrow({ where: { runId: run.id, status: "FAILED" } });
      expect(failed.error).toMatch(/MODEL_UNAVAILABLE/);
    } finally {
      await prisma.providerRoute.deleteMany();
      clearRouteCache();
    }
  });

  it("insights: inputs come from the last runs; site-check todos carry evidence and close when the check passes", async () => {
    const input = (await insightInput(prisma, brandId))!;
    expect(input.overallVisibility).toBe(100); // the fake answers always name the brand first
    expect(input.models.map((m) => m.model).sort()).toEqual(["chatgpt", "gemini", "google_ai_mode", "google_aio"]);
    expect(input.prompts.every((p) => p.answers > 0)).toBe(true);

    const failing = async () => ({ checkedAt: new Date().toISOString(), homepageReachable: true, blockedBots: ["GPTBot"], hasLlmsTxt: false, hasOrganizationSchema: true, hasFaqSchema: true });
    await runSiteCheck(prisma, brandId, failing);
    const open = await prisma.todo.findMany({ where: { brandId, ruleId: "site-check" }, orderBy: { subject: "asc" } });
    expect(open.map((t) => [t.subject, t.status, t.priority])).toEqual([
      ["llms-txt", "SUGGESTED", "MEDIUM"],
      ["robots-ai-bots", "SUGGESTED", "HIGH"],
    ]);
    expect(open[1]!.evidence).toMatchObject({ blockedBots: ["GPTBot"] });

    await prisma.todo.update({ where: { id: open[0]!.id }, data: { status: "TODO" } }); // user accepted it
    await generateInsights(prisma, null, brandId); // weekly regeneration keeps the user's status
    expect((await prisma.todo.findUniqueOrThrow({ where: { id: open[0]!.id } })).status).toBe("TODO");
    expect((await prisma.brand.findUniqueOrThrow({ where: { id: brandId } })).insightsAt).not.toBeNull();

    const { closed } = await runSiteCheck(prisma, brandId, async () => ({ ...(await failing()), blockedBots: [], hasLlmsTxt: true }));
    expect(closed).toBe(2);
    expect((await prisma.todo.findMany({ where: { brandId, ruleId: "site-check" } })).every((t) => t.status === "DONE")).toBe(true);
  });

  it("budget guard records a skipped run instead of spending", async () => {
    const run = await startRun({ ...deps, monthlyCreditBudget: 1 }, brandId);
    expect(run).toMatchObject({ status: "FAILED" });
    expect(run!.note).toMatch(/budget/);
    expect(await prisma.answer.count({ where: { runId: run!.id } })).toBe(0);
  });
});
