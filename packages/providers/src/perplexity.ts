import type { ModelTag } from "@avt/shared";
import { toCitations } from "./clean-url";
import { type AnswerProvider, type CaptureRequest, type CaptureResult, ProviderError } from "./types";

// Perplexity Agent API (docs.perplexity.ai, Nov 2026). Sonar Chat Completions were retired in Sept 2026.
// `effort: "fast"` is the cheapest preset that still searches the web and cites; it is billed in USD
// (usage.cost.total_cost), not credits.

type SearchResult = { id?: number; url?: string; title?: string };
type OutputItem =
  | { type: "search_results"; queries?: string[]; results?: SearchResult[] }
  | { type: "message"; content?: { type: string; text?: string }[] }
  | { type: string };
type AgentResponse = { status?: string; output?: OutputItem[]; usage?: { cost?: { total_cost?: number } } };

const MARKER = /\[web:(\d+)\]/g;

/** Pure: Agent API JSON → CaptureResult. Tested on fixtures. */
export function parsePerplexity(json: AgentResponse): Omit<CaptureResult, "provider" | "latencyMs"> {
  const output = json.output ?? [];
  const searches = output.filter((o): o is Extract<OutputItem, { type: "search_results" }> => o.type === "search_results");
  const raw = output
    .filter((o): o is Extract<OutputItem, { type: "message" }> => o.type === "message")
    .flatMap((m) => m.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n\n");

  const byId = new Map(searches.flatMap((s) => s.results ?? []).map((r) => [r.id, r]));
  // cited sources first, in the order the answer cites them; then the rest of what it read
  const citedIds = [...new Set([...raw.matchAll(MARKER)].map((m) => Number(m[1])))];
  const ordered = [...citedIds.map((id) => byId.get(id)), ...[...byId.values()].filter((r) => !citedIds.includes(r.id!))];
  const text = raw.replace(MARKER, "").replace(/[ \t]+([.,;:!?])/g, "$1").trim();
  const citations = toCitations(ordered.filter((r): r is SearchResult => !!r));

  const usd = json.usage?.cost?.total_cost;
  return {
    status: text ? "OK" : "NO_AI_RESULT",
    text: text || null,
    citations: text ? citations : [],
    fanout: searches.flatMap((s) => s.queries ?? []).map((query, i) => ({ query, kind: "WEB" as const, sequence: i + 1 })),
    raw: json,
    cost: usd === undefined ? {} : { usd },
  };
}

export class PerplexityProvider implements AnswerProvider {
  readonly name = "perplexity-api";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.perplexity.ai",
  ) {}

  supports(model: ModelTag) {
    return model === "perplexity";
  }

  async capture(r: CaptureRequest): Promise<CaptureResult> {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/agent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          effort: "fast",
          input: r.prompt,
          tools: [{ type: "web_search", user_location: { country: r.country.toUpperCase() } }],
        }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      throw new ProviderError(`perplexity network error: ${(e as Error).message}`, true);
    }
    const json = (await res.json().catch(() => null)) as AgentResponse & { error?: { message?: string; type?: string } };
    if (!res.ok || json?.status === "failed") {
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(`perplexity ${res.status}: ${json?.error?.message ?? "request failed"}`, retryable, json?.error?.type, res.status);
    }
    return { ...parsePerplexity(json), provider: this.name, latencyMs: Date.now() - started };
  }
}
