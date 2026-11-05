import { jaroWinkler, type Intent } from "@avt/shared";

/** `source` is stored on the prompt; `origin` tells the user where the idea came from. */
export type Suggestion = {
  text: string;
  intent: Intent;
  source: "SUGGESTED" | "FANOUT" | "GSC";
  origin: "site" | "google" | "ai-search" | "search-console";
};

const INTENT_ORDER: Record<Intent, number> = { COMMERCIAL: 0, INVESTIGATIONAL: 1, INFORMATIONAL: 2, NAVIGATIONAL: 3 };
const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

// ponytail: duplicates are found with Jaro-Winkler ≥ 0.9 on normalized text, not embeddings (handoff §11 says
// cosine ≥ 0.9). It catches rewordings of the same words, not paraphrases; add an embedding model if needed.
const similar = (a: string, b: string) => a === b || jaroWinkler(a, b) >= 0.9;

/** Drops suggestions that duplicate an existing prompt or each other, then ranks commercial intent first. */
export function mergeSuggestions(existing: string[], candidates: Suggestion[], limit = 25): Suggestion[] {
  const kept: Suggestion[] = [];
  const seen = existing.map(key);
  for (const c of candidates) {
    const k = key(c.text);
    if (k.length < 8 || seen.some((s) => similar(s, k))) continue;
    seen.push(k);
    kept.push(c);
  }
  return kept.sort((a, b) => INTENT_ORDER[a.intent] - INTENT_ORDER[b.intent]).slice(0, limit);
}

/** Readable text from an HTML page: scripts, styles and tags removed, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const COMMERCIAL = /\b(best|top|hire|near|cost|price|cheap|vs|agency|agencies|company|companies|service|services|firm|lawyer|reviews?)\b/i;

/** Google "People also ask" questions and related searches (handoff §11, source 3). */
export function googleToSuggestions(questions: string[], related: string[]): Suggestion[] {
  const cap = (q: string) => q.charAt(0).toUpperCase() + q.slice(1);
  return [...questions, ...related.filter((q) => q.split(" ").length >= 3)].map((q) => ({
    text: cap(q),
    intent: COMMERCIAL.test(q) ? "COMMERCIAL" : "INFORMATIONAL",
    source: "SUGGESTED" as const,
    origin: "google" as const,
  }));
}

const QUESTION = /^(who|what|which|where|why|when|how|is|are|can|should|does|do|best|top)\b/i;

/** Search Console queries that read like questions, most-searched first (handoff §11, source 2). */
export function searchConsoleToSuggestions(rows: { query: string; impressions: number }[], brandName: string): Suggestion[] {
  const own = brandName.toLowerCase();
  return [...rows]
    .sort((a, b) => b.impressions - a.impressions)
    .filter((r) => QUESTION.test(r.query) && r.query.split(" ").length >= 3 && !r.query.toLowerCase().includes(own))
    .map((r) => {
      const q = r.query.charAt(0).toUpperCase() + r.query.slice(1);
      return { text: /^(who|what|which|where|why|when|how|is|are|can|should|does|do)\b/i.test(q) && !q.endsWith("?") ? `${q}?` : q, intent: COMMERCIAL.test(q) ? "COMMERCIAL" : "INFORMATIONAL", source: "GSC" as const, origin: "search-console" as const };
    });
}

/** Fan-out search queries that read like questions a buyer would ask (handoff §11, source 4). */
export function fanoutToSuggestions(queries: string[]): Suggestion[] {
  return queries
    .filter((q) => q.split(" ").length >= 4)
    .map((q) => ({ text: q.charAt(0).toUpperCase() + q.slice(1), intent: /\b(best|top|hire|near|cost|price|vs|agency|company|service)\b/i.test(q) ? "COMMERCIAL" : "INFORMATIONAL", source: "FANOUT" as const, origin: "ai-search" as const }));
}
