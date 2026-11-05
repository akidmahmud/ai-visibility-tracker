import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDataForSeo } from "./dataforseo";
import { parsePerplexity } from "./perplexity";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf8"));

describe("parsePerplexity (Agent API)", () => {
  const r = parsePerplexity(fixture("perplexity-agent-from-docs"));

  it("strips [web:N] markers and keeps the answer text", () => {
    expect(r.status).toBe("OK");
    expect(r.text).toBe("For a Phoenix local business, **AEO Collective** focuses on local AI visibility. First Page Sage is a larger option.");
  });
  it("orders citations by first citation in the answer, then uncited sources", () => {
    expect(r.citations.map((c) => c.url)).toEqual([
      "https://aeo-collective.com/",
      "https://firstpagesage.com/seo-blog/aeo/",
      "https://www.reddit.com/r/SEO/comments/abc/aeo_agencies/",
    ]);
  });
  it("search queries become fan-out; cost is USD", () => {
    expect(r.fanout.map((f) => f.query)).toEqual(["best AEO agency Phoenix local business", "answer engine optimization agency Arizona"]);
    expect(r.cost).toEqual({ usd: 0.00452 });
  });
  it("no message text → NO_AI_RESULT", () => {
    expect(parsePerplexity({ output: [] }).status).toBe("NO_AI_RESULT");
  });
});

describe("parseDataForSeo", () => {
  it("AI Mode: markdown answer, element references first, de-duplicated", () => {
    const r = parseDataForSeo(fixture("dataforseo-aimode-from-docs"));
    expect(r.status).toBe("OK");
    expect(r.text).toContain("AEO Collective");
    expect(r.citations).toEqual([
      { url: "https://aeo-collective.com/", title: "AEO Collective", position: 1 },
      { url: "https://firstpagesage.com/", title: "First Page Sage", position: 2 },
      { url: "https://www.reddit.com/r/phoenix/comments/x/", title: "Phoenix marketing agencies", position: 3 },
    ]);
    expect(r.cost).toEqual({ usd: 0.004 });
  });
  it("SERP without an ai_overview item → NO_AI_RESULT", () => {
    const json = fixture("dataforseo-aimode-from-docs");
    json.tasks[0].result[0].items = [{ type: "organic", title: "x" }];
    expect(parseDataForSeo(json)).toMatchObject({ status: "NO_AI_RESULT", text: null, citations: [] });
  });
});
