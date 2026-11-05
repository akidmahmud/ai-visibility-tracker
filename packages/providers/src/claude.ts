import Anthropic from "@anthropic-ai/sdk";
import type { ModelTag } from "@avt/shared";
import { toCitations } from "./clean-url";
import { type AnswerProvider, type CaptureRequest, type CaptureResult, ProviderError } from "./types";

// Claude answers via the Messages API with the server-side web search tool (what claude.ai does when it searches).
// Billing: tokens at the model's list price + web search at $10 per 1,000 searches.
type Msg = Anthropic.Beta.BetaMessage;

const PRICE_PER_MTOK: Record<string, [input: number, output: number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
const USD_PER_SEARCH = 0.01;

/** Pure: final message(s) of one turn → CaptureResult. Cited sources first, then the rest of what Claude read. */
export function parseClaude(messages: Msg[]): Omit<CaptureResult, "provider" | "latencyMs"> {
  const blocks = messages.flatMap((m) => m.content);
  const text = blocks
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const cited = blocks.flatMap((b) =>
    b.type === "text" ? (b.citations ?? []).flatMap((c) => (c.type === "web_search_result_location" ? [{ url: c.url, title: c.title ?? undefined }] : [])) : [],
  );
  const read = blocks.flatMap((b) =>
    b.type === "web_search_tool_result" && Array.isArray(b.content) ? b.content.map((r) => ({ url: r.url, title: r.title ?? undefined })) : [],
  );
  const queries = blocks.flatMap((b) => (b.type === "server_tool_use" && b.name === "web_search" && typeof b.input.query === "string" ? [b.input.query] : []));

  let usd: number | undefined;
  const price = PRICE_PER_MTOK[messages[0]?.model ?? ""];
  if (price) {
    usd = messages.reduce((s, m) => {
      const u = m.usage;
      const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      return s + (input * price[0] + u.output_tokens * price[1]) / 1e6 + (u.server_tool_use?.web_search_requests ?? 0) * USD_PER_SEARCH;
    }, 0);
  }
  return {
    status: text ? "OK" : "NO_AI_RESULT",
    text: text || null,
    citations: text ? toCitations([...cited, ...read]) : [],
    fanout: queries.map((query, i) => ({ query, kind: "WEB" as const, sequence: i + 1 })),
    raw: messages,
    cost: usd === undefined ? {} : { usd: Math.round(usd * 1e6) / 1e6 },
  };
}

export class ClaudeProvider implements AnswerProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model = "claude-opus-5-5",
  ) {
    this.client = new Anthropic({ apiKey, timeout: 180_000 });
  }

  supports(model: ModelTag) {
    return model === "claude";
  }

  async capture(r: CaptureRequest): Promise<CaptureResult> {
    const started = Date.now();
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: r.prompt }];
    const turns: Msg[] = [];
    try {
      // a long search turn can pause; resend it as-is (max 3 times) and the server continues
      for (let i = 0; i < 3; i++) {
        const msg = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5, user_location: { type: "approximate", country: r.country.toUpperCase() } }],
          messages,
        });
        turns.push(msg);
        if (msg.stop_reason === "refusal") break;
        if (msg.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: msg.content });
      }
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
        throw new ProviderError(`anthropic: ${e.message}`, true, undefined, (e as { status?: number }).status);
      }
      if (e instanceof Anthropic.APIError) throw new ProviderError(`anthropic ${e.status}: ${e.message}`, false, undefined, e.status);
      throw e;
    }
    return { ...parseClaude(turns), provider: this.name, latencyMs: Date.now() - started };
  }
}
