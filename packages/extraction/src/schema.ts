import { z } from "zod";

// LLM output contract (handoff §8). firstIndex from the model is not trusted; code recomputes it.
export const MentionOut = z.object({
  name: z.string(),
  matchedKnownEntity: z.string().nullable(),
  domain: z.string().nullable(),
  firstIndex: z.number().int(),
  isRecommendation: z.boolean(),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  sentimentConfidence: z.number().min(0).max(1),
  summary: z.string().max(200),
});
export type MentionOut = z.infer<typeof MentionOut>;

export const ExtractionOut = z.object({ entities: z.array(MentionOut) });

/** An entity the brand already tracks (itself or a competitor). `key` is the Entity id. */
export type KnownEntity = { key: string; name: string; aliases: string[]; domain?: string | null };

export type ExtractInput = {
  text: string;
  known: KnownEntity[];
  citations: { url: string; title?: string | null }[];
};

/** One entity named in one answer, ready to resolve and store as a Mention. */
export type ExtractedMention = {
  name: string;
  knownKey: string | null;
  domain: string | null;
  firstIndex: number;
  isRecommendation: boolean;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  sentimentConfidence: number;
  summary: string;
  rank: number; // 1 = first recommended; 0 = named but not recommended (excluded from scoring)
  totalInAnswer: number; // number of recommended entities in the answer
  score: number;
};

/** The LLM step, injected so the pipeline and tests can swap or skip it. */
export type LlmExtractor = (input: ExtractInput) => Promise<MentionOut[]>;
