import { createPrisma } from "@avt/db";
import { providersFromEnv } from "@avt/providers";
import { QUEUE } from "@avt/shared";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { FlowProducer, Queue, Worker } from "bullmq";
import express from "express";
import IORedis from "ioredis";
import { llmExtractor, modelFromEnv } from "@avt/extraction";
import { generateInsights, runDueInsights, runSiteCheck } from "./insights";
import { classifyNewSites } from "./sites";
import { captureAnswer, captureBackoff, type CaptureJob, type Deps, extractPending, finalizeRun, startDueRuns, startRun } from "./pipeline";
import { RawStore } from "./raw-store";

try {
  process.loadEnvFile("../../.env");
} catch {
  // production passes env directly
}

const log = (msg: string, extra?: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

const providers = providersFromEnv();

const llmModel = modelFromEnv(); // extraction + site classification; null = known entities only
const budget = Number(process.env.MONTHLY_CREDIT_BUDGET);
const deps: Deps = {
  prisma: createPrisma(),
  providers,
  raw: new RawStore(),
  extractor: llmModel && llmExtractor(llmModel),
  flow: new FlowProducer({ connection }),
  monthlyCreditBudget: Number.isFinite(budget) && budget > 0 ? budget : undefined,
  log,
};

// Per-provider concurrency, e.g. {"cloro": 1}. Never exceed the vendor plan: Cloro answers 429 past it.
const concurrency: Record<string, number> = JSON.parse(process.env.PROVIDER_CONCURRENCY_JSON || "{}");

const workers: Worker[] = Object.keys(providers).map(
  (name) =>
    new Worker<CaptureJob>(QUEUE.capture(name), (job) => captureAnswer(deps, job), {
      connection,
      concurrency: concurrency[name] ?? 1,
      settings: { backoffStrategy: captureBackoff },
    }),
);
workers.push(
  new Worker(QUEUE.runs, (job) => finalizeRun(deps, job.data.runId), { connection }),
  new Worker(
    QUEUE.maintenance,
    async (job) => {
      if (job.name === "tick") {
        return {
          started: await startDueRuns(deps),
          extracted: await extractPending(deps),
          sitesClassified: await classifyNewSites(deps.prisma, llmModel).catch((e) => log("site classification failed", { error: (e as Error).message })),
          insights: await runDueInsights(deps.prisma, llmModel, log),
        };
      }
      if (job.name === "insights") return generateInsights(deps.prisma, llmModel, job.data.brandId, log);
      if (job.name === "site-check") return (await runSiteCheck(deps.prisma, job.data.brandId)).closed;
      if (job.name === "start-run") return (await startRun(deps, job.data.brandId))?.id ?? null;
    },
    { connection },
  ),
);
for (const w of workers) w.on("failed", (job, err) => log("job failed", { queue: w.name, jobId: job?.id, error: err.message }));

void new Queue(QUEUE.maintenance, { connection }).upsertJobScheduler("scheduler-tick", { every: 5 * 60_000 }, { name: "tick" });

// Bull Board on localhost only; reach it through an SSH tunnel on the server.
const board = new ExpressAdapter();
board.setBasePath("/queues");
createBullBoard({
  queues: [QUEUE.runs, QUEUE.maintenance, ...Object.keys(providers).map(QUEUE.capture)].map(
    (q) => new BullMQAdapter(new Queue(q, { connection })),
  ),
  serverAdapter: board,
});
const port = Number(process.env.BULL_BOARD_PORT ?? 4100);
express().use("/queues", board.getRouter()).listen(port, "127.0.0.1");

log("worker started", {
  providers: Object.keys(providers),
  extraction: deps.extractor ? process.env.EXTRACTION_MODEL || "gemini-2.5-flash-lite" : "known entities only (no LLM key)",
  bullBoard: `http://127.0.0.1:${port}/queues`,
});
if (!Object.keys(providers).length) log("no provider credentials set: nothing can be captured");
