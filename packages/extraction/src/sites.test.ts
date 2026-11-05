import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { classifySites } from "./llm";

const reply = (json: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  });

describe("classifySites", () => {
  it("maps each domain to a category; skipped domains become Other", async () => {
    const model = reply({ sites: [{ domain: "CitedCo.ai", category: "Marketing Agencies" }] });
    const out = await classifySites(model, [{ domain: "citedco.ai", title: "Cited Co" }, { domain: "unknown.example" }]);
    expect([...out]).toEqual([
      ["citedco.ai", "Marketing Agencies"],
      ["unknown.example", "Other"],
    ]);
  });
});
