import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import type { Candidate } from "./rules";

// The LLM only words things (handoff §10): its input is the compact evidence, never raw answers.

const Worded = z.object({ todos: z.array(z.object({ key: z.string(), title: z.string().max(120), detail: z.string().max(600) })) });

/** Rewrites todo titles and descriptions in one call. Falls back to the rule's default wording per item. */
export async function wordTodos<T extends Candidate>(model: LanguageModel | null, brand: string, todos: T[]): Promise<T[]> {
  if (!model || !todos.length) return todos;
  const key = (t: Candidate) => `${t.ruleId}|${t.subject}`;
  const { output } = await generateText({
    model,
    temperature: 0.2,
    system: `You write an action plan for ${brand}, a business trying to be recommended more often by AI assistants (ChatGPT, Gemini, Perplexity, Google AI).
For each item write a short imperative title (max 12 words) and a 2-3 sentence description: what to do, why the numbers show it matters, and the first concrete step.
Use only the facts in the evidence. Keep every number exactly as given. Return one entry per input key.`,
    output: Output.object({ schema: Worded }),
    prompt: JSON.stringify(todos.map((t) => ({ key: key(t), rule: t.ruleId, defaultTitle: t.title, evidence: t.evidence }))),
  });
  const byKey = new Map(output.todos.map((w) => [w.key, w]));
  return todos.map((t) => {
    const w = byKey.get(key(t));
    return w ? { ...t, title: w.title, detail: w.detail } : t;
  });
}

export const ContentBrief = z.object({
  title: z.string(),
  summary: z.string(),
  outline: z.array(z.object({ h2: z.string(), points: z.array(z.string()) })),
  questions: z.array(z.string()),
  entitiesAndFacts: z.array(z.string()),
  sitesToGetMentionedOn: z.array(z.object({ domain: z.string(), why: z.string() })),
});
export type ContentBrief = z.infer<typeof ContentBrief>;

export type BriefInput = {
  brand: { name: string; domain: string; description?: string | null };
  prompt: string;
  competitors: { name: string; summary: string; visibility: number }[];
  citedPages: { url: string; title: string | null; count: number }[];
  fanout: string[];
};

/** Content brief for one prompt (handoff §10): a page plan built from what AI currently cites and says. */
export async function writeBrief(model: LanguageModel, input: BriefInput): Promise<ContentBrief> {
  const { output } = await generateText({
    model,
    temperature: 0.3,
    system: `You are a content strategist. Write a brief for a page on ${input.brand.domain} that should make AI assistants recommend ${input.brand.name} when a buyer asks the given question.
Base it on the evidence: what the answers say about the competitors who win, the pages AI cites, and the searches AI runs. Do not invent statistics, prices or awards.`,
    output: Output.object({ schema: ContentBrief }),
    prompt: JSON.stringify(input),
  });
  return output;
}

export const PromptIdeas = z.object({
  prompts: z.array(z.object({ text: z.string(), intent: z.enum(["COMMERCIAL", "INVESTIGATIONAL", "INFORMATIONAL", "NAVIGATIONAL"]) })),
});

/** Buyer questions from the brand's own website text (handoff §11, source 1). */
export async function suggestPromptsFromSite(
  model: LanguageModel,
  input: { brand: string; country: string; siteText: string; existing: string[]; count?: number },
) {
  const { output } = await generateText({
    model,
    temperature: 0.4,
    system: `You suggest questions real buyers type into ChatGPT or Google AI when looking for a business like ${input.brand}.
Write natural questions for each service the business offers, combined with the locations it serves (country: ${input.country}).
Most should be commercial ("best X in Y", "who can help with Z"); do not mention ${input.brand} by name. Skip anything similar to the existing prompts.`,
    output: Output.object({ schema: PromptIdeas }),
    prompt: JSON.stringify({ websiteText: input.siteText.slice(0, 12_000), existing: input.existing, count: input.count ?? 15 }),
  });
  return output.prompts;
}

/** "Ask AI": answers a question about the brand's tracked data. `facts` is compact JSON built by the API; nothing else is known. */
export async function askData(model: LanguageModel, brand: string, facts: unknown, messages: { role: "user" | "assistant"; content: string }[]) {
  const { text } = await generateText({
    model,
    system:
      `You are an analyst for ${brand}'s AI search visibility (how often ChatGPT, Gemini, Perplexity, Google AI Overviews etc. mention the brand).\n` +
      "Answer only from the DATA below. Visibility is 0-100 (higher = mentioned more and earlier). Position is the average rank when mentioned (1 = first).\n" +
      "Be brief and concrete: name competitors, prompts, domains and numbers. If the data can't answer, say what is missing. Use short markdown lists when listing.\n" +
      `DATA:\n${JSON.stringify(facts)}`,
    messages: messages.slice(-10),
    maxOutputTokens: 800,
  });
  return text.trim();
}
