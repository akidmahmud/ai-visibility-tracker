import { jaroWinkler, normalizeName, score } from "@avt/shared";
import type { KnownMatch } from "./matcher";
import type { ExtractedMention, KnownEntity, MentionOut } from "./schema";

const FUZZY_IN_TEXT = 0.9;

/**
 * Where `name` first appears in `text`: exact (case-insensitive) first, else the best window of the
 * same word count at Jaro-Winkler ≥ 0.9 (punctuation differences like "Power Rogers, LLP"). -1 = not there.
 */
export function locate(text: string, name: string): number {
  const exact = text.toLowerCase().indexOf(name.toLowerCase());
  if (exact >= 0) return exact;
  const target = normalizeName(name);
  if (!target) return -1;
  const n = target.split(" ").length;
  const words = [...text.matchAll(/[\p{L}\p{N}&'’.-]+/gu)];
  for (let i = 0; i + n <= words.length; i++) {
    const window = words.slice(i, i + n).map((w) => w[0]).join(" ");
    if (jaroWinkler(normalizeName(window), target) >= FUZZY_IN_TEXT) return words[i]!.index!;
  }
  return -1;
}

const SENTIMENT = { positive: "POSITIVE", neutral: "NEUTRAL", negative: "NEGATIVE" } as const;

/**
 * Post-processing (handoff §8): drop names the answer doesn't contain, let deterministic matches win for
 * known entities, merge repeats, then rank recommendations by first appearance and score them.
 */
export function finalizeMentions(text: string, llm: MentionOut[], known: KnownMatch[], entities: KnownEntity[]): ExtractedMention[] {
  const knownByName = new Map(entities.flatMap((e) => [e.name, ...e.aliases].map((a) => [normalizeName(a), e.key] as const)));
  const knownMatch = new Map(known.map((k) => [k.key, k]));
  const merged = new Map<string, ExtractedMention>(); // key: entity key for known, normalized name otherwise

  for (const m of llm) {
    const index = locate(text, m.name);
    if (index < 0) continue; // hallucination guard
    const knownKey =
      (m.matchedKnownEntity && knownByName.get(normalizeName(m.matchedKnownEntity))) || knownByName.get(normalizeName(m.name)) || null;
    // the model may claim a known entity the deterministic pass didn't find; trust it only if the name is there
    const id = knownKey ?? normalizeName(m.name);
    const firstIndex = knownKey && knownMatch.has(knownKey) ? Math.min(index, knownMatch.get(knownKey)!.index) : index;
    const prev = merged.get(id);
    if (prev && prev.firstIndex <= firstIndex) {
      prev.isRecommendation ||= m.isRecommendation;
      continue;
    }
    merged.set(id, {
      name: knownKey ? entities.find((e) => e.key === knownKey)!.name : m.name,
      knownKey,
      domain: m.domain,
      firstIndex,
      isRecommendation: m.isRecommendation || (prev?.isRecommendation ?? false),
      sentiment: SENTIMENT[m.sentiment],
      sentimentConfidence: m.sentimentConfidence,
      summary: m.summary,
      rank: 0,
      totalInAnswer: 0,
      score: 0,
    });
  }

  // known entities the LLM missed (or no LLM at all): deterministic wins
  for (const k of known) {
    if (merged.has(k.key)) continue;
    merged.set(k.key, {
      name: k.name,
      knownKey: k.key,
      domain: entities.find((e) => e.key === k.key)?.domain ?? null,
      firstIndex: k.index,
      isRecommendation: true,
      sentiment: "NEUTRAL",
      sentimentConfidence: 0,
      summary: "",
      rank: 0,
      totalInAnswer: 0,
      score: 0,
    });
  }

  const all = [...merged.values()].sort((a, b) => a.firstIndex - b.firstIndex);
  const recommended = all.filter((m) => m.isRecommendation);
  recommended.forEach((m, i) => {
    m.rank = i + 1;
    m.totalInAnswer = recommended.length;
    m.score = score(m.rank, recommended.length);
  });
  for (const m of all) if (!m.isRecommendation) m.totalInAnswer = recommended.length;
  return all;
}
