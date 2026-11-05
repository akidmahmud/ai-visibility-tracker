import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { extractMentions, findKnownMentions, llmExtractor, locate, type KnownEntity, type MentionOut } from "./index";

const known: KnownEntity[] = [
  { key: "self", name: "AEO Collective", aliases: ["AEO Collective LLC"], domain: "aeo-collective.com" },
  { key: "fps", name: "First Page Sage", aliases: [], domain: "firstpagesage.com" },
  { key: "sons", name: "Smith & Sons", aliases: [], domain: null },
];

const mention = (name: string, extra: Partial<MentionOut> = {}): MentionOut => ({
  name,
  matchedKnownEntity: null,
  domain: null,
  firstIndex: 0,
  isRecommendation: true,
  sentiment: "positive",
  sentimentConfidence: 0.9,
  summary: `${name} is good.`,
  ...extra,
});

describe("findKnownMentions", () => {
  it("whole words, case-insensitive, possessives, & ↔ and", () => {
    const text = "Try aeo collective's local plan, or Smith and Sons. First Page Sagely is not a firm.";
    expect(findKnownMentions(text, known).map((m) => [m.key, m.index])).toEqual([
      ["self", 4],
      ["sons", 36],
    ]);
  });
  it("matches the brand's domain too", () => {
    expect(findKnownMentions("See firstpagesage.com for details.", known)[0]?.key).toBe("fps");
  });
});

describe("locate", () => {
  it("exact, then fuzzy for punctuation differences, else -1", () => {
    expect(locate("Hire Power Rogers LLP today", "power rogers llp")).toBe(5);
    expect(locate("Hire Power Rogers, LLP today", "Power Rogers LLP")).toBe(5);
    expect(locate("Nothing here", "Invented Agency")).toBe(-1);
  });
});

describe("extractMentions", () => {
  const text =
    "1. Web Tonic is fast. 2. AEO Collective focuses on Arizona. 3. Cited Co and 4. First Page Sage are larger. Unlike Animalz, they do local work.";

  it("4 brands recommended, you're 2nd → 75; contrast-only mention gets rank 0", async () => {
    const llm = async () => [
      mention("Web Tonic"),
      mention("AEO Collective", { matchedKnownEntity: "AEO Collective" }),
      mention("Cited Co"),
      mention("First Page Sage"),
      mention("Animalz", { isRecommendation: false, sentiment: "neutral" }),
    ];
    const out = await extractMentions({ text, known, citations: [] }, llm);
    expect(out.map((m) => [m.name, m.rank, m.totalInAnswer, m.score])).toEqual([
      ["Web Tonic", 1, 4, 100],
      ["AEO Collective", 2, 4, 75],
      ["Cited Co", 3, 4, 50],
      ["First Page Sage", 4, 4, 25],
      ["Animalz", 0, 4, 0],
    ]);
    expect(out[1]).toMatchObject({ knownKey: "self", sentiment: "POSITIVE" });
  });

  it("drops names the answer doesn't contain (hallucination guard)", async () => {
    const out = await extractMentions({ text, known, citations: [] }, async () => [mention("Web Tonic"), mention("Made Up Agency")]);
    expect(out.map((m) => m.name)).not.toContain("Made Up Agency");
  });

  it("deterministic matches fill in known entities the LLM missed", async () => {
    const out = await extractMentions({ text, known, citations: [] }, async () => [mention("Web Tonic")]);
    expect(out.map((m) => m.name)).toEqual(["Web Tonic", "AEO Collective", "First Page Sage"]);
    expect(out[1]).toMatchObject({ knownKey: "self", rank: 2, sentiment: "NEUTRAL" });
  });

  it("without an LLM, known entities are still found and ranked", async () => {
    const out = await extractMentions({ text, known, citations: [] }, null);
    expect(out.map((m) => [m.name, m.rank, m.score])).toEqual([
      ["AEO Collective", 1, 100],
      ["First Page Sage", 2, 50],
    ]);
  });

  it("ranks by what the reader sees: names inside link URLs don't count; parenthetical suffixes are dropped", async () => {
    const linked = "See [this guide](https://webtonic.io/guide). **AEO Collective** is first. Then Web Tonic (Phoenix).";
    const out = await extractMentions({ text: linked, known, citations: [] }, async () => [mention("Web Tonic (Phoenix)"), mention("AEO Collective")]);
    expect(out.map((m) => [m.name, m.rank])).toEqual([
      ["AEO Collective", 1],
      ["Web Tonic", 2],
    ]);
  });

  it("asks once more when a list answer comes back with ≤ 1 provider, and merges both passes", async () => {
    const list = "Options:\n1. Web Tonic\n2. Cited Co\n3. Bemo Design\n";
    let calls = 0;
    const flaky = async () => (++calls === 1 ? [mention("Web Tonic")] : [mention("Web Tonic"), mention("Cited Co"), mention("Bemo Design")]);
    const out = await extractMentions({ text: list, known: [], citations: [] }, flaky);
    expect(calls).toBe(2);
    expect(out.map((m) => m.name)).toEqual(["Web Tonic", "Cited Co", "Bemo Design"]);

    calls = 0;
    await extractMentions({ text: "Just one: Web Tonic.", known: [], citations: [] }, flaky);
    expect(calls).toBe(1); // not a list answer: no second call
  });

  it("merges repeats of one entity, keeping its first position", async () => {
    const out = await extractMentions(
      { text: "Clifford Law Offices wins. Later, Clifford Law again.", known: [], citations: [] },
      async () => [mention("Clifford Law Offices"), mention("clifford law offices")],
    );
    expect(out).toHaveLength(1);
  });
});

describe("llmExtractor", () => {
  it("sends the answer and known entities, parses structured output", async () => {
    let prompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        prompt = JSON.stringify(opts.prompt);
        return {
          content: [{ type: "text", text: JSON.stringify({ entities: [mention("Web Tonic")] }) }],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 20, text: 20, reasoning: undefined },
          },
          warnings: [],
        };
      },
    });
    const out = await llmExtractor(model)({ text: "Web Tonic is good.", known, citations: [{ url: "https://webtonic.io" }] });
    expect(out[0]?.name).toBe("Web Tonic");
    expect(prompt).toContain("AEO Collective");
    expect(prompt).toContain("Web Tonic is good.");
  });
});
