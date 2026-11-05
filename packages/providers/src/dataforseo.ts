import type { ModelTag } from "@avt/shared";
import { toCitations } from "./clean-url";
import { googleLocation } from "./location";
import { type AnswerProvider, type CaptureRequest, type CaptureResult, ProviderError } from "./types";

// DataForSEO SERP API (docs.dataforseo.com/v3, Nov 2026): Google AI Overview (organic SERP with
// load_async_ai_overview) and Google AI Mode. Live endpoints; billed in USD per task (`cost`).
const ENDPOINT: Partial<Record<ModelTag, string>> = {
  google_aio: "/v3/serp/google/organic/live/advanced",
  google_ai_mode: "/v3/serp/google/ai_mode/live/advanced",
};

// 40202 rate limit, 40209 too many simultaneous requests, 5xxxx their side: worth retrying
const RETRYABLE = new Set([40202, 40209]);
const NO_RESULTS = 40102;

type Reference = { url?: string; title?: string; source?: string };
type AiItem = { type: string; markdown?: string; text?: string; references?: Reference[]; items?: AiItem[] };
type Task = { status_code: number; status_message?: string; cost?: number; result?: { items?: AiItem[] }[] | null };
type DfsResponse = { status_code: number; status_message?: string; cost?: number; tasks?: Task[] };

const regionName = new Intl.DisplayNames(["en"], { type: "region" });

/** Pure: DataForSEO JSON → CaptureResult. Tested on fixtures. */
export function parseDataForSeo(json: DfsResponse): Omit<CaptureResult, "provider" | "latencyMs"> {
  const task = json.tasks?.[0];
  const ai = task?.result?.[0]?.items?.find((i) => i.type === "ai_overview");
  // references sit on the overview and on each of its elements; keep answer order
  const refs = ai ? [...(ai.items ?? []).flatMap((e) => e.references ?? []), ...(ai.references ?? [])] : [];
  const text = (ai?.markdown || ai?.items?.map((e) => e.markdown ?? e.text ?? "").join("\n\n") || "").trim();
  const usd = task?.cost ?? json.cost;
  return {
    status: text ? "OK" : "NO_AI_RESULT",
    text: text || null,
    citations: text ? toCitations(refs.map((r) => ({ url: r.url, title: r.title || r.source }))) : [],
    fanout: [], // Google does not expose AI Overview / AI Mode fan-out
    raw: json,
    cost: usd === undefined ? {} : { usd },
  };
}

export class DataForSeoProvider implements AnswerProvider {
  readonly name = "dataforseo";
  private readonly auth: string;

  constructor(
    login: string,
    password: string,
    private readonly baseUrl = "https://api.dataforseo.com",
  ) {
    this.auth = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
  }

  supports(model: ModelTag) {
    return model in ENDPOINT;
  }

  async capture(r: CaptureRequest): Promise<CaptureResult> {
    const path = ENDPOINT[r.model];
    if (!path) throw new ProviderError(`dataforseo does not support ${r.model}`, false);

    const task = {
      keyword: r.prompt,
      location_name: r.location ? googleLocation(r.location, r.country) : regionName.of(r.country.toUpperCase()),
      language_code: r.language,
      ...(r.model === "google_aio" ? { load_async_ai_overview: true } : {}),
    };
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: this.auth, "Content-Type": "application/json" },
        body: JSON.stringify([task]),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      throw new ProviderError(`dataforseo network error: ${(e as Error).message}`, true);
    }
    const json = (await res.json().catch(() => null)) as DfsResponse | null;
    const code = json?.tasks?.[0]?.status_code ?? json?.status_code ?? res.status;
    if (code === NO_RESULTS && json) return { ...parseDataForSeo(json), provider: this.name, latencyMs: Date.now() - started };
    if (!res.ok || !json || code !== 20000) {
      const message = json?.tasks?.[0]?.status_message ?? json?.status_message ?? "request failed";
      throw new ProviderError(`dataforseo ${code}: ${message}`, RETRYABLE.has(code) || code >= 50000 || res.status >= 500, String(code), res.status);
    }
    return { ...parseDataForSeo(json), provider: this.name, latencyMs: Date.now() - started };
  }
}
