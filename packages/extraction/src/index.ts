import { findKnownMentions } from "./matcher";
import { finalizeMentions } from "./merge";
import type { ExtractedMention, ExtractInput, LlmExtractor } from "./schema";

export * from "./schema";
export { findKnownMentions } from "./matcher";
export { finalizeMentions, locate } from "./merge";
export { classifySites, extractorFromEnv, llmExtractor, modelFromEnv, SITE_BATCH, SYSTEM_PROMPT } from "./llm";

/**
 * Two-step extraction (handoff §8): deterministic matching of known entities, then the LLM for everything
 * else plus sentiment and summaries. Without an LLM it still finds and ranks known entities.
 */
export async function extractMentions(input: ExtractInput, llm: LlmExtractor | null): Promise<ExtractedMention[]> {
  // positions come from what the reader sees: a name inside a link URL must not count as an earlier mention
  const visible = visibleText(input.text);
  const known = findKnownMentions(visible, input.known);
  let fromLlm = llm ? await llm(input) : [];
  // small models sometimes stop after the first provider in a list; one more pass, merged, catches that
  if (llm && fromLlm.length <= 1 && listItems(visible) >= 3) fromLlm = [...fromLlm, ...(await llm(input))];
  const cleaned = fromLlm.map((m) => ({ ...m, name: m.name.replace(/\s*\([^)]*\)\s*$/, "").trim() }));
  return finalizeMentions(visible, cleaned, known, input.known);
}

/** Lines that look like list entries, headings or bold names: where providers usually sit in an answer. */
export function listItems(text: string): number {
  return text.split("\n").filter((l) => /^\s*(?:\d+[.)]|[-*•]|#{1,4})\s+\S|^\s*\*\*[^*]+\*\*/.test(l)).length;
}

/** Blanks out markdown link targets and bare URLs with spaces, keeping every character offset unchanged. */
export function visibleText(text: string): string {
  return text
    .replace(/\]\([^)\s]*\)/g, (m) => "]" + " ".repeat(m.length - 1))
    .replace(/https?:\/\/\S+/g, (m) => " ".repeat(m.length));
}
