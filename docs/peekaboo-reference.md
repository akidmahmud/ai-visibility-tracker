# Peekaboo reference (observed 2026-11-03)

What the client's current Peekaboo account showed, logged in as the client. Use it to keep our numbers comparable and to plan the Phase 5 import. Every item below was seen in a captured request or on screen. Nothing here is guessed.

## Account shape
- 82 brands, 1,585 prompts, ~4 competitors per brand, every brand on `WEEKLY` (from `GET /api/brands/list`).
- Engines per brand: `gpt-4o-mini`, `gemini-2.5-flash`, `sonar`, `google-aio`, `google-ai-mode`. Copilot and `claude-api` are paid upsells (from `GET /api/brands/:id/models`).
- **ChatGPT, Gemini and Perplexity come from the developer APIs** (`gpt-4o-mini`, `gemini-2.5-flash`, `sonar`), not the consumer apps. We capture the consumer apps through Cloro, so our ChatGPT/Gemini numbers will not match Peekaboo's even with the same formula. Compare trends, not values (handoff §17.3).
- Local tracking exists per prompt, with city targets (`GET /api/brands/:id/prompt-local-tracking`).

## Scoring matches handoff §7
`GET /api/scoring/visibility` returns per-answer scores. Observed values (80, 86, 67, 33, 25, 20) all equal `round((total − rank + 1) / total × 100)`, and answers without a mention appear as 0 in the list. Visibility is their mean.

## Dashboard data (for parity of our pages)
- Summary: `visibility.score`, `runCount`, `sentiment.{percent,positive,total}`, `position.average`.
- Over time (`/api/over-time-insights/:brandId?timeRange&groupBy=day`): a series per tracked entity, competitor table (visibility, sentiment, avg position, `isYourBrand`, `isUntracked`), source types with counts, top 50 domains (`usedPercent`, `type`, `ownership`: you / competitor / thirdParty), recent chats.
- Source-type taxonomy seen: Marketing Agencies, Software & Tools, Reviews & Directories, Social Media, Local Services, Professional Services, Other.
- Prompt fields: `promptText`, `category` (topic), `searchIntent`, `isActive`, `runs`, `rollupMetrics`, `citationsSummary`, `sentimentSummary`.
- Pages: dashboard, chat, prompts, competitors, sources, market traffic, search console, traffic, AI crawlers, todos, content briefs, share links, integrations, settings.

## Import route (Phase 5)
Settings → Integrations has a **REST API** tab (API keys, for unattended use), **API Docs**, Usage, Looker Studio, and an MCP server at `https://www.aipeekaboo.com/api/mcp`. Build the import on the REST API with a key the client creates, not on the internal `/api/*` dashboard routes above (those are undocumented and session-cookie based).

## AEO Collective baseline (last 30 days, Peekaboo)
Visibility 16–18%, rising from 13 to 26 over six weekly runs; avg position 1.6; 90% positive. Tracked competitors: Minuttia, Animalz, First Page Sage, noGood. Entities actually appearing most: Web Tonic, Cited Co, Bemo Design. Prompts and competitors are in `packages/db/prisma/seed/aeo-collective.json`.
