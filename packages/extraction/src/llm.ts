import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { SITE_CATEGORIES, type SiteCategory } from "@avt/shared";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import { ExtractionOut, type LlmExtractor } from "./schema";

// Draft from handoff §8; tune against eval/.
export const SYSTEM_PROMPT = `You extract companies, brands, products and service providers that an AI answer presents to a user.
Rules:
- Include every distinct company/brand/provider named in the answer, in order of first appearance.
- Read the WHOLE answer before replying. Names often appear as headings, numbered or bulleted list items, bold text,
  standalone lines, or place/map cards; an answer listing several providers must yield all of them, not just the first.
- Copy each name exactly as written, without a location or descriptor in parentheses. Do not invent names.
  Do not include generic categories ("local law firms").
- Do not include the AI assistants or search engines the question is about (ChatGPT, Gemini, Perplexity, Google) unless the answer recommends them as a provider.
- Merge repeats of the same entity (e.g. "Clifford Law" and "Clifford Law Offices").
- If a name matches one of KNOWN_ENTITIES (or their aliases), set matchedKnownEntity to that canonical name.
- isRecommendation=false when the entity is only used as contrast or context.
- sentiment reflects how THIS answer describes the entity to a buyer.
- summary: one sentence paraphrasing what the answer says about the entity.
Return JSON only.`;

const MAX_ANSWER_CHARS = 20_000;

export function llmExtractor(model: LanguageModel): LlmExtractor {
  return async ({ text, known, citations }) => {
    const { output } = await generateText({
      model,
      temperature: 0,
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: ExtractionOut }),
      prompt: [
        `KNOWN_ENTITIES: ${JSON.stringify(known.map((k) => ({ name: k.name, aliases: k.aliases, domain: k.domain ?? null })))}`,
        `CITATIONS: ${JSON.stringify(citations.slice(0, 30).map((c) => ({ url: c.url, title: c.title ?? null })))}`,
        `ANSWER:\n${text.slice(0, MAX_ANSWER_CHARS)}`,
      ].join("\n\n"),
    });
    return output.entities;
  };
}

// EXTRACTION_MODEL picks the provider by name: "vendor/model" (e.g. "google/gemma-4-31b-it:free") uses
// OpenRouter, "gemini-..." uses Google, "gpt-..." or "o3..." uses OpenAI.
// Returns null when that provider's key is not configured.
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): LanguageModel | null {
  const id = env.EXTRACTION_MODEL || "gemini-2.5-flash-lite";
  if (id.includes("/")) {
    if (!env.OPENROUTER_API_KEY) return null;
    // OpenRouter speaks the OpenAI Chat Completions API
    return createOpenAI({ apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", name: "openrouter" }).chat(id);
  }
  if (id.startsWith("gemini")) return env.GEMINI_API_KEY ? createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY })(id) : null;
  if (/^(gpt|o\d)/.test(id)) return env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY })(id) : null;
  throw new Error(`EXTRACTION_MODEL "${id}" is not an OpenRouter, Gemini or OpenAI model`);
}

export function extractorFromEnv(env: NodeJS.ProcessEnv = process.env): LlmExtractor | null {
  const model = modelFromEnv(env);
  return model ? llmExtractor(model) : null;
}

/** Sites per classification call: one call covers a whole run's new domains on a small free quota. */
export const SITE_BATCH = 40;

const SiteOut = z.object({ sites: z.array(z.object({ domain: z.string(), category: z.enum(SITE_CATEGORIES) })) });

/** Classifies cited domains into SITE_CATEGORIES in one call. Domains the model skips come back as "Other". */
export async function classifySites(model: LanguageModel, sites: { domain: string; title?: string | null }[]): Promise<Map<string, SiteCategory>> {
  const { output } = await generateText({
    model,
    temperature: 0,
    system: `You classify websites that AI assistants cite as sources. For each domain pick exactly one category from: ${SITE_CATEGORIES.join(", ")}.
Use the page title as a hint. A business's own website goes under what the business is (e.g. a law firm is "Professional Services", a plumber "Local Services", an SEO agency "Marketing Agencies"). Return every domain given.`,
    output: Output.object({ schema: SiteOut }),
    prompt: JSON.stringify(sites.slice(0, SITE_BATCH)),
  });
  const byDomain = new Map(output.sites.map((s) => [s.domain.toLowerCase(), s.category]));
  return new Map(sites.slice(0, SITE_BATCH).map((s) => [s.domain, byDomain.get(s.domain.toLowerCase()) ?? "Other"]));
}
