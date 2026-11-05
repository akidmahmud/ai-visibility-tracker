import type { ModelTag } from "@avt/shared";
import { toCitations } from "./clean-url";
import { googleLocation, usState } from "./location";
import { type AnswerProvider, type CaptureRequest, type CaptureResult, type FanoutQuery, ProviderError } from "./types";

// Verified against docs.cloro.dev (llms-full.txt, Nov 2026) and recorded responses in __fixtures__.
// ponytail: sync API only. Async (/v1/async/task) skips the +2 credit sync surcharge (~30% cheaper);
// switch once volume makes it worth a poll/webhook loop.
const ENDPOINT: Partial<Record<ModelTag, string>> = {
  chatgpt: "chatgpt",
  gemini: "gemini",
  perplexity: "perplexity",
  google_ai_mode: "aimode",
  google_aio: "google",
  copilot: "copilot",
};

/** Sync credit cost per call (base + add-ons we enable + sync surcharge). Used by the budget guard. */
export const CLORO_SYNC_CREDITS: Partial<Record<ModelTag, number>> = {
  chatgpt: 9, // 5 + 2 fan-out + 2 sync
  gemini: 6,
  perplexity: 6,
  google_ai_mode: 6,
  google_aio: 7, // 3 search + 2 AIO + 2 sync
  copilot: 7,
};

// Cloro's own docs: no sources AND a very short body = provider sent a canned refusal, not an answer.
const EMPTY_ANSWER_CHARS = 160;

type Source = { position?: number; url?: string; label?: string };
// AI Mode (and Gemini/ChatGPT) list the inline-cited pages as `citationPills`; `sources` alone can hold just one
type Answer = { text?: string; markdown?: string; sources?: Source[]; citationPills?: Source[] };
type CloroResult = Answer & {
  aioverview?: Answer;
  organicResults?: { link?: string; title?: string; position?: number }[];
  searchQueries?: unknown[];
  mapSearchQueries?: unknown[];
  search_model_queries?: unknown[];
};

export function body(r: CaptureRequest): Record<string, unknown> {
  const country = r.country.toUpperCase();
  // local tracking: Google engines take a canonical place name; the assistants only a US state (+2 credits)
  const geo = { country, hl: r.language, ...(r.location ? { location: googleLocation(r.location, country) } : {}) };
  const state = usState(r.location, country);
  const assistant = { prompt: r.prompt, country, ...(state ? { state } : {}) };
  switch (r.model) {
    case "google_aio":
      return { query: r.prompt, ...geo, include: { aioverview: { markdown: true } } };
    case "google_ai_mode":
      return { prompt: r.prompt, ...geo, include: { markdown: true } };
    case "chatgpt":
      return { ...assistant, include: { markdown: true, searchQueries: r.wantFanout } };
    default:
      return { ...assistant, include: { markdown: true } };
  }
}

function fanout(r: CloroResult): FanoutQuery[] {
  const web = [...(r.searchQueries ?? []), ...(r.search_model_queries ?? [])];
  const maps = r.mapSearchQueries ?? [];
  const asText = (q: unknown) => (typeof q === "string" ? q : (q as { query?: string })?.query);
  const list = [
    ...web.map((q) => ({ query: asText(q), kind: "WEB" as const })),
    ...maps.map((q) => ({ query: asText(q), kind: "MAPS" as const })),
  ].filter((q): q is { query: string; kind: "WEB" | "MAPS" } => !!q.query);
  return list.map((q, i) => ({ ...q, sequence: i + 1 }));
}

/** Pure: Cloro JSON body → CaptureResult (minus cost/latency, which come from headers). Tested on fixtures. */
export function parseCloro(model: ModelTag, json: { result?: CloroResult }): Omit<CaptureResult, "cost" | "provider"> {
  const result = json.result ?? {};
  // AI Overview rides on Google Search; no `aioverview` key = Google showed none
  const answer = model === "google_aio" ? result.aioverview : result;
  const text = (answer?.markdown || answer?.text || "").replaceAll("[cite ]", "").trim();
  const cites = toCitations([...(answer?.sources ?? []), ...(answer?.citationPills ?? [])].map((s) => ({ url: s.url, title: s.label })));
  const empty = !answer || !text || (cites.length === 0 && text.length < EMPTY_ANSWER_CHARS);
  const aiCites = empty ? [] : cites;
  // Google's blue links ride along with the AI Overview check; kept (even when no Overview showed) but flagged
  const seen = new Set(aiCites.map((c) => c.url));
  const search =
    model === "google_aio"
      ? toCitations(result.organicResults?.map((o) => ({ url: o.link, title: o.title })))
          .filter((c) => !seen.has(c.url))
          .map((c, i) => ({ ...c, position: aiCites.length + i + 1, searchResult: true }))
      : [];
  return {
    status: empty ? "NO_AI_RESULT" : "OK",
    text: empty ? null : text,
    citations: [...aiCites, ...search],
    fanout: fanout(result),
    raw: json,
  };
}

/** Pure: Google Search JSON → "People also ask" questions and related searches (prompt ideas, handoff §11). */
export function parseCloroSerp(json: { result?: { peopleAlsoAsk?: { question?: string }[]; relatedSearches?: { query?: string }[] } }) {
  const r = json.result ?? {};
  return {
    questions: (r.peopleAlsoAsk ?? []).map((q) => q.question?.trim()).filter((q): q is string => !!q),
    related: (r.relatedSearches ?? []).map((q) => q.query?.trim()).filter((q): q is string => !!q),
  };
}

export function cloroError(status: number, json: unknown): ProviderError {
  const err = (json as { error?: { code?: string; message?: string } })?.error;
  const code = err?.code;
  // 429 = our limiter is set above the plan's concurrency; 5xx = upstream hiccup. Both clear on their own.
  const retryable = status === 429 || status >= 500;
  return new ProviderError(`cloro ${status} ${code ?? ""}: ${err?.message ?? "request failed"}`.trim(), retryable, code, status);
}

export class CloroProvider implements AnswerProvider {
  readonly name = "cloro";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.cloro.dev",
    private readonly usdPerCredit = 0.00038,
  ) {}

  supports(model: ModelTag) {
    return model in ENDPOINT;
  }

  /** One plain Google search (no AI Overview add-on): People-also-ask questions and related searches. */
  async searchQuestions(query: string, country: string, language: string) {
    const res = await fetch(`${this.baseUrl}/v1/monitor/google`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, country: country.toUpperCase(), hl: language }),
      signal: AbortSignal.timeout(330_000),
    }).catch((e: Error) => {
      throw new ProviderError(`cloro network error: ${e.message}`, true);
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !(json as { success?: boolean })?.success) throw cloroError(res.status, json);
    const credits = Number(res.headers.get("x-credits-charged") ?? NaN);
    return { ...parseCloroSerp(json), credits: Number.isFinite(credits) ? credits : 0, usd: (Number.isFinite(credits) ? credits : 0) * this.usdPerCredit };
  }

  async capture(r: CaptureRequest): Promise<CaptureResult> {
    const path = ENDPOINT[r.model];
    if (!path) throw new ProviderError(`cloro does not support ${r.model}`, false);

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/monitor/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body(r)),
        // Cloro retries internally for up to 5 min; closing earlier loses a result we still pay for
        signal: AbortSignal.timeout(330_000),
      });
    } catch (e) {
      throw new ProviderError(`cloro network error: ${(e as Error).message}`, true);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !(json as { success?: boolean })?.success) throw cloroError(res.status, json);

    const credits = Number(res.headers.get("x-credits-charged") ?? NaN);
    return {
      ...parseCloro(r.model, json as { result?: CloroResult }),
      provider: this.name,
      cost: Number.isFinite(credits) ? { credits, usd: credits * this.usdPerCredit } : {},
      latencyMs: Date.now() - started,
    };
  }
}
