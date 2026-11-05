# AI Visibility Tracker: Development Handoff

> Handoff spec for building an AI-visibility (GEO/AEO) tracker for a client agency, modeled on aipeekaboo.com.
> Read this whole file before writing code. Build in the phase order at the bottom. Each phase has acceptance criteria.
> Anything marked **VERIFY** depends on a third-party API whose exact contract must be checked against current docs before coding.

---

## 1. What we are building

An internal platform for an agency (one owner, many client brands, ~40–80 brands, ~2,000 prompts). It:

1. Stores **brands**, their **competitors**, and the **prompts** (buyer questions) to track.
2. On a schedule, sends every active prompt to **5 AI answer engines**: ChatGPT, Gemini, Perplexity, Google AI Overview, Google AI Mode. Copilot and Claude are optional.
3. Saves each raw answer, its **cited sources** and (where available) the **fan-out search queries**.
4. **Extracts** every brand mentioned: rank, sentiment, one-line summary.
5. Scores **visibility** and aggregates by brand × model × day.
6. Shows dashboards, competitor comparisons, sources, an action plan and content briefs. Shares white-label reports with the agency's clients.

Target: replace a Peekaboo subscription at a fraction of the cost, with no prompt limits and the agency's own branding.

### Agreed project decisions
- **Hosting:** our KVM 2 VPS (2 vCPU / 8 GB). The client's $100/year maintenance charge covers the server.
- **Answer capture:** both **Cloro** and **DataForSEO** are integrated. A **super-admin panel** switches the provider per engine at runtime (see §6.1).
- **Client pays:** development, Cloro/DataForSEO usage, and the LLM usage for extraction and insights (his API keys, his billing).

---

## 1.1 Reference implementation: Elmo (read before designing)

**[elmohq/elmo](https://github.com/elmohq/elmo)** is an MIT-licensed, self-hostable AEO/GEO tracker and the closest open-source equivalent to Peekaboo. Study it before implementing each area. Use it as a **reference, not a dependency**. Our stack (NestJS + Next.js + BullMQ) differs from theirs (TanStack Start + Postgres + pg-boss).

What it covers that we also need:
- Capture of ChatGPT, Google AI Mode, Google AI Overviews, Gemini, Perplexity and Copilot via scraping providers, and Claude, Grok and others via direct model APIs with web search
- Competitor benchmarking, share of voice, mention-rate leaderboard
- Citations stored with domain and position, then categorized
- Sentiment per prompt / model / competitor, with supporting passages
- Query fan-out analysis, prompt management, opportunities
- Shareable reports, white-label (branding, custom domain), REST API, SDKs, MCP server

How to use it:
1. Clone it and run it locally (`elmo compose up -d`) with a few of the client's real prompts to see real data shapes.
2. Read its **provider integrations** (their providers guide and source). Check whether Cloro and/or DataForSEO adapters already exist; reuse request/response handling ideas for §6.
3. Compare its **data model** (prompts, runs, mentions, citations) with §4 and adopt anything we're missing.
4. Study how its mention/sentiment judge ("Jev") works. It needs a key from Elmo's makers and costs ~$0.15–0.35 per 1,000 answers. **Do not depend on it**; our extraction (§8) runs on the client's own LLM key.
5. Look at its share-report and white-label implementation before building §13 `/r/[token]` and Phase 5.

Rules:
- If any Elmo code is copied, keep the MIT copyright and licence notice in that file, and list it in `THIRD_PARTY_NOTICES.md`.
- Don't fork the whole app. Port ideas and isolated logic into our packages.
- **Not verified (check in the repo):** which scraping providers it supports, how well multi-brand/agency use works at 40–80 brands, current maintenance status (it has ~90 open issues).

Other repos (lower priority): [oneglanse/oneglanse](https://github.com/oneglanse/oneglanse) uses its own browser automation (avoid that approach: account bans, proxies, fragile); [limelit-co/open](https://github.com/limelit-co/open) (Go + SQLite, API keys only).

---

## 2. Stack decision: TypeScript (not Python, not Rust)

| Option | Verdict | Why |
|---|---|---|
| **TypeScript (NestJS + Next.js)** | ✅ **Use this** | The workload is I/O-bound (waiting on AI APIs), not CPU-bound. One language across web, API and workers means shared types and Zod schemas (one definition of "a mention" everywhere). BullMQ is the best Node job queue. The Vercel AI SDK gives provider-agnostic structured LLM output. Fastest to build and maintain solo. |
| Python (FastAPI + Celery) | ❌ Not needed | Only worth it for heavy NLP/ML. Extraction is done by an LLM API call, so Python adds a second language and duplicated types for no gain. |
| Rust | ❌ Overkill | Compute cost is ~0; the bill is API credits. Rust would only slow development. |

**Final stack**

- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 15 (App Router), React, Tailwind, shadcn/ui, Recharts, TanStack Query
- **API:** NestJS (REST), Zod validation (`nestjs-zod`), OpenAPI via `@nestjs/swagger`
- **Workers:** NestJS standalone app running BullMQ processors (same codebase, separate process)
- **DB:** PostgreSQL 16 + Prisma
- **Queue/cache:** Redis 7 + BullMQ (+ Bull Board for an admin UI)
- **LLM layer:** Vercel AI SDK (`ai` + `@ai-sdk/google` / `@ai-sdk/openai` / `@ai-sdk/anthropic`) with `generateObject` + Zod
- **Auth:** Clerk (organizations, Google login, and later an OAuth server for MCP). Fallback if the client wants no vendor: Better Auth with the organizations plugin.
- **Object storage:** Cloudflare R2 (raw HTML/markdown of answers, report PDFs, logos)
- **Email:** Resend
- **Observability:** Sentry (web, api, worker) + pino structured logs
- **Hosting:** our KVM 2 VPS (2 vCPU / 8 GB / NVMe) with Docker Compose and Caddy (auto TLS, including on-demand TLS for white-label custom domains). Daily pg_dump to R2. The load is I/O-bound, so 2 vCPU is enough. Keep raw HTML in R2 (not on the VPS disk) and watch disk usage.

---

## 3. Repository layout

```
/apps
  /web            Next.js (dashboard, share-link pages, settings)
  /api            NestJS REST API (auth guard, CRUD, analytics read endpoints)
  /worker         NestJS standalone: BullMQ processors + scheduler
/packages
  /db             Prisma schema, migrations, seed, typed client export
  /shared         Zod schemas, enums, DTO types, scoring + normalization utils (pure functions)
  /providers      One adapter per AI engine (Cloro, Gemini, Perplexity, Anthropic, SERP fallback)
  /extraction     Mention extraction (LLM prompt + schema + validation)
  /insights       Gap rules engine, action-plan + content-brief generation
  /config         eslint, tsconfig, tailwind presets
/infra
  docker-compose.yml, Caddyfile, backup scripts
```

Rules:
- `packages/shared` has **no I/O**. Scoring, normalization and date bucketing are pure functions with unit tests.
- Providers and extraction are **interfaces with swappable implementations**. Never call a vendor SDK directly from a processor.

---

## 4. Data model (Prisma, summarized)

All ids are UUID (`@default(uuid())`). All tables have `createdAt`/`updatedAt`. Soft delete via `deletedAt` where noted.

```prisma
model Workspace {            // the agency
  id, name, clerkOrgId (unique)
  whiteLabel   Json?       // logo url, 5 colors, custom domain
  brands       Brand[]
}

model Brand {
  id, workspaceId, name, websiteUrl, domain        // domain normalized: no www, lowercase
  description, industry, language (default "en"), country (default "US")
  aliases      String[]                             // other names customers use
  frequency    RunFrequency  @default(WEEKLY)       // DAILY | EVERY_2_DAYS | EVERY_3_DAYS | WEEKLY | MONTHLY
  enabledModels ModelTag[]                          // subset of the 5–7 engines
  isActive     Boolean @default(true)
  nextRunAt    DateTime?
  deletedAt    DateTime?
}

model Competitor {
  id, brandId, entityId                               // points to canonical Entity
  isTracked Boolean                                   // user-confirmed vs auto-suggested
  deletedAt DateTime?
  @@unique([brandId, entityId])
}

model Entity {               // canonical company/brand across ALL answers (global, not per workspace)
  id, canonicalName, domain (unique, nullable)
  aliases  EntityAlias[]
}
model EntityAlias { id, entityId, normalized String @unique, raw String }

model Topic  { id, brandId, name }
model Prompt {
  id, brandId, topicId?, text
  intent    Intent      // COMMERCIAL | INVESTIGATIONAL | INFORMATIONAL | NAVIGATIONAL
  isActive  Boolean
  location  String?     // e.g. "Chicago, IL, US"; null = brand country default
  source    PromptSource // MANUAL | SUGGESTED | GSC | FANOUT
  deletedAt DateTime?
}

model Run {                  // one scheduled execution for a brand
  id, brandId, scheduledFor, status (QUEUED|RUNNING|DONE|PARTIAL|FAILED)
  startedAt, finishedAt, promptCount, answerCount, errorCount
}

model Answer {               // one model answering one prompt (Peekaboo's "prompt run")
  id, runId, promptId, brandId, model ModelTag
  status   AnswerStatus  // OK | NO_AI_RESULT (e.g. no AI Overview shown) | FAILED
  text     String?        // markdown/plain text answer
  rawKey   String?        // R2 key for raw HTML/JSON payload
  provider String         // "cloro" | "gemini-api" | "perplexity-api" | ...
  costCredits Decimal?    // what this call cost (credits or USD); for cost dashboards
  latencyMs Int?
  capturedAt DateTime
  extractedAt DateTime?
  @@index([brandId, capturedAt]) @@index([promptId, model, capturedAt])
}

model Mention {              // one brand/entity named inside one answer
  id, answerId, brandId (denormalized), entityId
  kind      MentionKind   // SELF | COMPETITOR | UNTRACKED
  rank      Int           // 1 = first brand named
  totalInAnswer Int
  score     Int           // formula in §7
  sentiment Sentiment     // POSITIVE | NEUTRAL | NEGATIVE
  sentimentConfidence Float
  summary   String        // one line: how the answer describes this entity
  @@index([brandId, entityId])
}

model Citation {
  id, answerId, brandId, url, domain, title?, position Int
  ownerType  OwnerType   // SELF | COMPETITOR | THIRD_PARTY
  siteType   String      // Marketplace, Reviews & Directories, News, Social, Forum, Wiki, Professional Services, Other...
  @@index([brandId, domain])
}

model FanoutQuery { id, answerId, query, kind (WEB|MAPS|SITE), sequence Int }

model DailyRollup {          // brand × entity × model × day: dashboards read ONLY this
  brandId, entityId, model, day (Date)
  answers Int, mentions Int, scoreSum Int, rankSum Int
  positive Int, neutral Int, negative Int
  @@id([brandId, entityId, model, day])
}
model DailyCitationRollup { brandId, domain, model, day, count Int  @@id([brandId, domain, model, day]) }

model Todo {
  id, brandId, title, detail, ruleId String
  priority  (HIGH|MEDIUM|LOW), effort (S|M|L), gapPoints Float
  type (ON_PAGE|OFF_PAGE|TECHNICAL), category String, models ModelTag[]
  status (SUGGESTED|TODO|DONE|ARCHIVED)
  evidence Json                       // the numbers that triggered it
}
model ContentBrief { id, brandId, promptId, status, body Json, generatedAt }
model SiteCheck   { id, brandId, checkedAt, results Json }   // robots AI bots, llms.txt, org schema
model ShareLink   { id, brandId, token (unique), visibleTabs String[], revokedAt?, opens ShareOpen[] }
model ShareOpen   { id, shareLinkId, openedAt, ipHash, ua }
model ProviderUsage { id, day, provider, model, calls Int, credits Decimal, usd Decimal }
```

Notes:
- Raw answers grow fast (~25k–300k rows/month). Postgres TOAST compresses `text` automatically. Keep raw HTML in R2. Add monthly partitioning of `Answer`/`Mention`/`Citation` (raw SQL migration) when rows pass ~5M.
- The **dashboard must never aggregate raw `Mention` rows**. It reads `DailyRollup` only.

---

## 5. Pipeline

```
Scheduler (every 5 min) ──► finds brands with nextRunAt <= now
   └─► creates Run, FlowProducer parent job "run:{runId}"
         ├─ child: capture(promptId, model)   × (prompts × enabledModels)
         │     → queue per provider (rate-limited, concurrency-limited)
         │     → saves Answer + Citation + FanoutQuery
         │     → enqueues extract(answerId)
         ├─ extract(answerId)  (batched 20 at a time)
         │     → writes Mention rows
         └─ parent completes → rollup(runId) → insights(brandId) [weekly only]
```

Queues (BullMQ): `capture:cloro`, `capture:gemini`, `capture:perplexity`, `capture:anthropic`, `extract`, `rollup`, `insights`, `sitecheck`, `maintenance`.

Rules:
- **Idempotency key** for capture = `runId:promptId:model`. Re-running a job must not create a duplicate Answer.
- **Retries:** 3 attempts, exponential backoff (30s, 2m, 10m). 4xx client errors are not retried. After the last failure, save `Answer.status = FAILED` so the run can finish as `PARTIAL`.
- **Per-provider limiter:** e.g. `{ max: N, duration: 1000 }` from env. Never exceed the vendor's concurrency.
- **Budget guard:** before enqueueing a Run, estimate its credits. If the workspace monthly budget (env/config) would be exceeded, pause and alert instead of running.
- `nextRunAt` is computed from `frequency` and **jittered** (± up to 2h) so brands don't all fire at once.
- **Manual "Run now"** on a brand is allowed, rate-limited to once per 24h.

---

## 6. Provider adapters (`packages/providers`)

```ts
export interface CaptureRequest {
  prompt: string; model: ModelTag; country: string; language: string; location?: string;
  wantFanout: boolean;
}
export interface CaptureResult {
  status: 'OK' | 'NO_AI_RESULT';
  text: string | null;          // normalized markdown
  citations: { url: string; title?: string; position: number }[];
  fanout: { query: string; kind: 'WEB'|'MAPS'|'SITE'; sequence: number }[];
  raw: unknown;                 // stored to R2
  cost: { credits?: number; usd?: number };
  provider: string;
}
export interface AnswerProvider { supports(model: ModelTag): boolean; capture(r: CaptureRequest): Promise<CaptureResult>; }
```

Routing (configurable per model in DB/env, so it can switch providers without a deploy):

| Model tag | Primary | Fallback |
|---|---|---|
| `chatgpt` | **Cloro** ChatGPT (web search on; add raw + fan-out) | OpenAI Responses API + `web_search` tool |
| `gemini` | **Cloro** Gemini | Gemini API + Google Search grounding |
| `perplexity` | **Cloro** Perplexity | Perplexity API (**VERIFY**: Sonar chat completions were deprecated Sept 2026; use their Agent API) |
| `google_aio` | **Cloro** Google Search + AI Overview add-on | DataForSEO SERP (AI Overview) |
| `google_ai_mode` | **Cloro** Google AI Mode | DataForSEO AI Mode SERP |
| `copilot` (opt) | Cloro Copilot | n/a |
| `claude` (opt) | Anthropic API + web search tool | n/a |

### 6.1 Super-admin provider switch

Both Cloro and DataForSEO adapters are built for every engine they support. A super-admin page controls routing at runtime with no redeploy:

```prisma
model ProviderRoute {
  model      ModelTag @id          // chatgpt | gemini | perplexity | google_aio | google_ai_mode | ...
  primary    String                // "cloro" | "dataforseo" | "gemini-api" | ...
  fallback   String?               // used automatically after primary fails all retries
  enabled    Boolean @default(true)
  updatedBy  String, updatedAt DateTime
}
```

- Super-admin role only (us, not the client's users). Every change is written to an audit log.
- The page shows per-provider health (success rate, avg latency, last error) and cost per 1,000 answers from `ProviderUsage`, so switching is an informed decision.
- Workers read routing from Redis (cached, invalidated on save), so a switch applies to the next job.
- Store `Answer.provider` on every answer. Charts mark the date a provider changed, because switching shifts numbers.
- "Test" button: runs one prompt through the selected provider and shows the parsed result before saving.

**VERIFY against docs.cloro.dev and docs.dataforseo.com before coding:** endpoint paths, request params (country/location/language), response fields for sources and fan-out, async vs sync mode, concurrency limit per plan.
Known credit costs (Nov 2026): ChatGPT 5 (+2 raw/fan-out), Gemini 4, Perplexity 3, Copilot 3, AI Mode 4, Google Search 3 (+2 AI Overview). Read `X-Credits-Charged` from response headers and store it on `Answer.costCredits`.

Every adapter:
- Normalizes text to markdown and strips tracking params from citation URLs.
- Returns `NO_AI_RESULT` (not an error) when the engine showed no AI answer (common for AI Overviews).
- Has a recorded-fixture test (save real responses to `__fixtures__`, test the parser offline).

---

## 7. Scoring (`packages/shared/scoring.ts`)

Matches Peekaboo's published methodology, so the client's numbers stay comparable:

```
score(rank, total) = round(((total - rank + 1) / total) * 100)
not mentioned in an OK answer  → 0
NO_AI_RESULT / FAILED answers  → excluded from the denominator (show separately as "AI Overview shown in X% of searches")
visibility(brand, window, filters) = sum(score) / count(OK answers)
mentionRate = answers mentioning brand / OK answers               (the "% of AI chats mentioning brand" chart)
avgPosition = mean(rank) over answers where mentioned
sentimentPct = positive mentions / all mentions
trend = mean(recent half) - mean(older half); |Δ| >= 5 → up/down, else stable (need >= 4 points)
shareOfVoice(entity) = mentions(entity) / mentions(all entities)
```

Unit-test every function with the worked example: 4 brands named, you're 2nd → 75.

---

## 8. Extraction (`packages/extraction`)

Two steps per answer:

**Step 1, deterministic (free):**
- Build a matcher from the brand's name + aliases + domain, its competitors' entities + aliases, and citation domains in this answer.
- Find all matches with positions (case-insensitive, word-boundary, handle `&`/`and`, possessives).

**Step 2, LLM (cheap model, structured output):**
- Model: Gemini 2.5 Flash-Lite or GPT-4.1-mini (configurable). Temperature 0. Use the batch API for scheduled runs (about 50% cheaper).
- Input: answer text, list of known entities (name + aliases), citations.
- Output schema:

```ts
const MentionOut = z.object({
  name: z.string(),                 // exactly as written in the answer
  matchedKnownEntity: z.string().nullable(),
  domain: z.string().nullable(),    // if the answer or a citation ties it to a site
  firstIndex: z.number().int(),     // char offset of first appearance
  isRecommendation: z.boolean(),    // recommended/listed as an option vs merely referenced (e.g. "unlike X")
  sentiment: z.enum(['positive','neutral','negative']),
  sentimentConfidence: z.number().min(0).max(1),
  summary: z.string().max(200),
});
const ExtractionOut = z.object({ entities: z.array(MentionOut) });
```

System prompt (draft; tune against the eval set):
```
You extract companies, brands, products and service providers that an AI answer presents to a user.
Rules:
- Include every distinct company/brand/provider named in the answer, in order of first appearance.
- Copy each name exactly as written. Do not invent names. Do not include generic categories ("local law firms").
- Merge repeats of the same entity (e.g. "Clifford Law" and "Clifford Law Offices").
- If a name matches one of KNOWN_ENTITIES (or their aliases), set matchedKnownEntity to that canonical name.
- isRecommendation=false when the entity is only used as contrast or context.
- sentiment reflects how THIS answer describes the entity to a buyer.
- summary: one sentence paraphrasing what the answer says about the entity.
Return JSON only.
```

Post-processing (in code):
1. **Hallucination guard:** drop any entity whose `name` does not occur in the answer text (fuzzy ≥ 0.9 allowed for punctuation differences).
2. Merge Step-1 matches the LLM missed (deterministic wins for known entities).
3. Rank = order by `firstIndex` among entities with `isRecommendation=true` (non-recommendations are stored with rank 0 and excluded from scoring).
4. Resolve each name → canonical `Entity` (see §9). Classify as SELF / COMPETITOR / UNTRACKED.
5. Compute score and write `Mention` rows in one transaction; set `Answer.extractedAt`.

**Eval set (required before launch):** 100 hand-labeled answers across all 5 engines and 3+ industries in `packages/extraction/eval/`. CI script reports precision/recall on entity names and rank accuracy. Target ≥ 95% entity precision, ≥ 90% recall. Re-run on every prompt or model change.

---

## 9. Entity resolution & competitor detection

Normalization function (`normalizeName`):
- lowercase, NFKD, strip accents, `&` → `and`
- remove legal suffixes: llc, llp, inc, ltd, co, corp, corporation, pc, p.c., plc, gmbh, pty, limited, company, group (only at end)
- remove punctuation, collapse whitespace

Resolution order for a raw name:
1. Exact `EntityAlias.normalized` match → that entity.
2. Domain from the citation or answer matches `Entity.domain` → that entity (add alias).
3. Jaro-Winkler ≥ 0.93 against aliases **within the same brand's known entities** → that entity (add alias). Never fuzzy-merge globally (avoids "Apple" ↔ "Apple Hospitality").
4. Otherwise create a new `Entity` (domain may be null, filled later by a background `entity-enrich` job that looks the name up via SERP top result, capped per day).

UI:
- **Merge / split entities** (admin + workspace owner). Merging rewrites `Mention.entityId` and rebuilds affected rollups.
- **Suggested competitors:** UNTRACKED entities with mention rate ≥ 10% over 30 days and ≥ 5 mentions, shown with "Track" / "Ignore".

---

## 10. Insights: action plan, content briefs, site checkup (`packages/insights`)

Principle: **rules find the gaps and rank them with numbers; the LLM only writes the wording.**

Rules (each produces a candidate Todo with `evidence` JSON):

| Rule id | Trigger | Todo |
|---|---|---|
| `cited-not-you` | Domain cited in answers that mention competitors ≥ N times, never on answers that mention you | "Get listed on {domain}" (off-page, backlinks/PR) |
| `zero-prompt` | Prompt with visibility 0 over the last 4 runs (all models) | "Create a page answering '{prompt}'" (content) |
| `competitor-beats-you` | Competitor visibility − yours ≥ 15 pts on a prompt cluster | "Publish {You} vs {Competitor} comparison" |
| `model-gap` | Your visibility on one model ≥ 20 pts below your average | "Improve presence on sources {model} cites" |
| `forum-source` | reddit/quora cited ≥ X% in your category | "Participate in threads AI cites" |
| `video-source` | youtube cited ≥ X% | "Make videos for these questions" |
| `negative-sentiment` | ≥ 20% negative mentions | "Address negative framing: {summaries}" |
| site checkup | robots.txt blocks GPTBot/ClaudeBot/PerplexityBot/Google-Extended; no /llms.txt; no Organization JSON-LD on homepage; FAQ schema missing | technical todos, auto-closed when the next check passes |

Priority = `gapPoints × intentWeight (commercial 1.0, investigational 0.8, informational 0.5)`, bucketed into HIGH/MEDIUM/LOW.
Generation runs **weekly** per brand: rules → top 15 → one LLM call to write titles and descriptions (input = compact JSON of evidence, not raw answers). A todo is deduplicated by `ruleId + subject` across weeks.

**Content brief** (on demand, cached 7 days): input = prompt, top 3 competitor summaries, top cited URLs + titles, fan-out queries. Output = title, H2 outline, questions to answer, entities/facts to include, sites to get mentioned on.

---

## 11. Prompt suggestions

Sources, merged and deduplicated by embedding similarity (cosine ≥ 0.9 = duplicate):
1. **LLM from website:** fetch the homepage + 3 key pages, then generate buyer questions per service × location.
2. **Search Console** (if connected): question-like queries → rewrite as prompts.
3. **SERP "People Also Ask" + related searches** for the brand's core keywords (Cloro Google Search or DataForSEO).
4. **Fan-out queries** observed in ChatGPT/Gemini answers.
Rank by intent (commercial first), then by search volume where available (DataForSEO keyword volume, optional/paid).

---

## 12. API (NestJS) for MVP

All routes are under `/api`, authenticated via Clerk JWT, workspace-scoped by guard. Every query filters by `workspaceId` (write an e2e test that tries cross-workspace access).

```
GET/POST/PATCH/DELETE  /brands, /brands/:id
GET/POST/PATCH/DELETE  /brands/:id/prompts      (+ POST /bulk, POST /bulk-status, POST /suggest)
GET/POST/DELETE        /brands/:id/competitors  (+ GET /suggested)
GET/POST               /brands/:id/topics
POST                   /brands/:id/run-now
GET /brands/:id/summary?from&to&models&topics&intents          → visibility, mentionRate, sentiment, avgPosition, trend
GET /brands/:id/timeseries?groupBy=day                           → per entity series
GET /brands/:id/competitors/leaderboard
GET /brands/:id/competitors/heatmap                              → entity × model
GET /brands/:id/competitors/matrix                               → prompt × top-5 entities
GET /brands/:id/sources?groupBy=domain|url                       → with ownerType, siteType, per-model counts, CSV export
GET /brands/:id/answers?prompt&model&mentioned&page              → raw chats list
GET /answers/:id                                                 → full answer + mentions + citations + fanout
GET/PATCH /brands/:id/todos, POST /brands/:id/todos/generate
GET/POST /brands/:id/briefs
GET/POST /brands/:id/site-check
CRUD /share-links  ;  GET /public/share/:token/*                 (no auth, read-only, tab-gated)
GET /workspace/usage                                             → answers, credits, $ by day/provider
```

---

## 13. Web app (Next.js) pages

- `/dashboard`: KPIs, visibility-over-time chart (you vs top competitors), competitor table, top sources, recent chats
- `/prompts`: table with per-prompt visibility, citations, topic, intent, model chips, bulk actions, suggestions drawer
- `/prompts/[id]`: per-model history, each answer with highlighted mentions, fan-out queries
- `/competitors`: leaderboard, brand × model heatmap, prompt × brand matrix, suggested competitors
- `/sources`: domains/URLs tabs, site-type donut, per-model table, export
- `/actions`: site checkup + todo board (Suggested / To-do / Done / Archived)
- `/briefs`: queue sorted by lowest visibility
- `/settings`: workspace, brands (details, aliases, frequency, models), white-label, share links (with open counts), usage/costs, team
- `/r/[token]`: public white-label share report (same components, read-only)

Global filter bar (brand, models, topics, intents, date range) is held in URL search params, so views are shareable.

---

## 14. Environment variables

```
DATABASE_URL, REDIS_URL
CLERK_SECRET_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLORO_API_KEY, CLORO_BASE_URL
GEMINI_API_KEY, OPENAI_API_KEY, PERPLEXITY_API_KEY, ANTHROPIC_API_KEY (fallbacks / optional)
DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD (fallback / keyword volume, optional)
EXTRACTION_MODEL=gemini-2.5-flash-lite
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
RESEND_API_KEY, SENTRY_DSN
MONTHLY_CREDIT_BUDGET, PROVIDER_CONCURRENCY_JSON
```

All keys belong to the client's accounts. Never commit secrets; use `.env` locally and Docker secrets / env files on the server.

---

## 15. Build phases & acceptance criteria

**Phase 0: Foundations (week 1)**
Monorepo, Docker Compose (postgres, redis), Prisma schema + migrations, Clerk auth + workspace guard, CI (lint, typecheck, test).
✅ Can sign in, create a workspace and a brand; a cross-workspace access e2e test passes.

**Phase 1: Capture pipeline (weeks 2–3)**
Provider interface + Cloro adapters for the 5 engines (fixtures + tests), scheduler, FlowProducer runs, retries, budget guard, Bull Board, usage tracking.
✅ "Run now" on a brand with 10 prompts produces 50 Answers with citations; failures end the run as PARTIAL, not stuck; credits are recorded.

**Phase 2: Extraction + scoring + rollups (weeks 3–4)**
Extraction package, entity resolution, eval set + CI score, scoring utils, rollup jobs.
✅ Eval ≥ 95% precision / ≥ 90% recall; the 4-brands/rank-2 = 75 test passes; dashboard queries hit only rollup tables (< 300 ms at 1M mentions, verified with seeded data).

**Phase 3: Dashboard MVP (weeks 4–6)**
Dashboard, prompts, prompt detail, competitors (leaderboard, heatmap, matrix), sources, raw chats, global filters, share links.
✅ The client can do daily work without opening Peekaboo; a share link renders a read-only report for an anonymous visitor.

**Phase 4: Insights (weeks 6–7)**
Site checkup, rules engine, weekly todos, content briefs, suggested competitors, prompt suggestions.
✅ Each todo shows its evidence numbers; site-check todos auto-close on pass.

**Phase 5: Agency polish (weeks 7–8)**
White-label (logo, colors, custom domain via Caddy on-demand TLS), PDF export, Peekaboo data import (via their v1 API with the client's key), usage/cost page.
✅ A report on `reports.<agency>.com` shows the agency's branding only.

**Phase 6: Later / optional**
GSC + GA4 OAuth, AI crawler logs (Cloudflare Worker + WP plugin), MCP server, local (city) tracking, public REST API, Copilot/Claude engines, Similarweb traffic.

---

## 16. Testing

- Unit: scoring, normalization, entity resolution, rules engine (pure functions, Vitest).
- Adapter tests on recorded fixtures (no live calls in CI).
- Extraction eval script (`pnpm eval:extraction`), run before any extraction change.
- e2e (Playwright) for core flows + tenant isolation.
- One weekly live "canary" run on a test brand with 3 prompts to detect vendor format changes early (alert on parse failure).

---

## 17. Problems you will face (and mitigations)

1. **Single-vendor dependency on Cloro.** Price changes, outages or format changes break capture. → Adapter interface + configurable routing + native-API fallbacks + weekly canary + store `raw` so you can re-parse.
2. **AI answers are non-deterministic.** The same prompt gives different brands run to run, so day-to-day numbers look noisy. → Show trends over 7/30 days, show run counts, and optionally run high-value prompts 2–3× per cycle and average. Explain this to the client up front.
3. **Numbers won't match Peekaboo exactly**, even with the same formula (different capture time, location, sampling). → Run both in parallel for 2–4 weeks and compare trends, not exact values. Set this expectation in writing.
4. **AI Overview often doesn't appear.** If counted as "not mentioned", visibility looks artificially low. → `NO_AI_RESULT` status, excluded from the denominator, shown as its own "AIO shown" rate.
5. **Entity duplicates and false merges** ("Power Rogers, LLP" vs "Power Rogers LLP"; "Apple" vs "Apple Hospitality"). → §9 rules, brand-scoped fuzzy matching only, manual merge/split UI.
6. **Extraction hallucinations / misses.** → Hallucination guard, deterministic merge for known entities, eval set in CI.
7. **Runaway costs** from retries, a bad loop or someone adding 5,000 prompts. → Budget guard, idempotency keys, per-provider limiter, daily cost alert email, cap on prompts per brand (configurable).
8. **Rate limits / concurrency caps** at the vendor cause jobs to pile up. → One queue per provider with a limiter tuned to the plan; jitter schedules; alert if queue lag > 1 run interval.
9. **Data volume growth** (≈ 300k answers/month if all prompts run daily). → Rollup tables, indexes, raw payloads in R2, partitioning past ~5M rows, retention policy for raw HTML (e.g. 180 days).
10. **Location/language accuracy.** Local tracking depends on vendor support per engine. → Check coverage per engine before promising city-level tracking.
11. **Perplexity API churn.** Sonar chat completions were deprecated in Sept 2026. → Use Cloro or Perplexity's current Agent API; never hardcode one endpoint.
12. **Google OAuth verification** for Search Console/GA scopes (sensitive scopes need app verification for external users). → Defer to Phase 6; internal-only use while unverified.
13. **White-label custom domains** need TLS per domain. → Caddy on-demand TLS with an `ask` endpoint that only approves registered domains.
14. **Multi-tenant data leaks** (one client seeing another's brand via share links or a missing filter). → Workspace guard on every query, opaque random share tokens, tab-gating, e2e isolation test.
15. **Peekaboo migration limits.** Their API caps history (100 runs per prompt, 90 days) and truncates snippets. → Import config (brands, prompts, competitors, topics) + recent aggregates; accept that full raw history won't come over.
16. **Vendor ToS / scraping risk** sits with the capture vendor, but a crackdown by OpenAI/Google could degrade UI capture overnight. → Native-API fallbacks are already in the design; label the data source per model in the UI.

---

## 18. Cost reference (for budget guard defaults)

Approximate, Nov 2026. **VERIFY** current vendor pricing.
- Cloro: ~$0.36–0.40 per 1,000 credits (Starter ~$250/mo for 650k credits). All 5 engines per prompt ≈ 23 credits ≈ $0.009.
- DataForSEO: pay-as-you-go, $50 minimum deposit. AI Overview ≈ $0.0012–0.004, AI Mode ≈ $0.0012–0.004 per request.
- Extraction + insights LLM: ~$10–20/month at ~23k answers/month (Flash-Lite / 4.1-mini, batch). This is separate from Cloro/DataForSEO, which only capture answers.
- Server: our KVM 2 VPS, covered by the client's $100/year maintenance charge.
