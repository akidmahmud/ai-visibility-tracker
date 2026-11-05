import type { ModelTag } from "@avt/shared";
import { CloroProvider } from "./cloro";
import { DataForSeoProvider } from "./dataforseo";
import { PerplexityProvider } from "./perplexity";
import { ClaudeProvider } from "./claude";
import type { AnswerProvider } from "./types";

/** Every provider whose credentials are present, keyed by the name used in ProviderRoute. */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): Record<string, AnswerProvider> {
  const out: Record<string, AnswerProvider> = {};
  if (env.CLORO_API_KEY) out.cloro = new CloroProvider(env.CLORO_API_KEY, env.CLORO_BASE_URL || undefined);
  if (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD) out.dataforseo = new DataForSeoProvider(env.DATAFORSEO_LOGIN, env.DATAFORSEO_PASSWORD);
  if (env.PERPLEXITY_API_KEY) out["perplexity-api"] = new PerplexityProvider(env.PERPLEXITY_API_KEY);
  if (env.ANTHROPIC_API_KEY) out.anthropic = new ClaudeProvider(env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL || undefined);
  return out;
}

/** Every provider the system knows and the engines it can capture, configured or not (admin routing page). */
export const PROVIDER_MODELS: Record<string, ModelTag[]> = {
  cloro: ["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode", "copilot"],
  dataforseo: ["google_aio", "google_ai_mode"],
  "perplexity-api": ["perplexity"],
  anthropic: ["claude"],
};
