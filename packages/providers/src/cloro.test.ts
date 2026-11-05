import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanUrl } from "./clean-url";
import { cloroError, parseCloro, parseCloroSerp } from "./cloro";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", `${name}.json`), "utf8"));

describe("parseCloro on recorded responses", () => {
  it.each([
    ["chatgpt", "chatgpt"],
    ["chatgpt-aeo", "chatgpt"],
    ["gemini-aeo", "gemini"],
    ["aimode-aeo", "google_ai_mode"],
    ["google-aio-aeo", "google_aio"],
    ["google-aio", "google_aio"],
  ] as const)("%s → OK answer with markdown and clean, deduped citations", (name, model) => {
    const r = parseCloro(model, fixture(name));
    expect(r.status).toBe("OK");
    expect(r.text!.length).toBeGreaterThan(500);
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations.map((c) => c.position)).toEqual(r.citations.map((_, i) => i + 1));
    expect(new Set(r.citations.map((c) => c.url)).size).toBe(r.citations.length);
    for (const c of r.citations) expect(c.url).not.toMatch(/#:~:|utm_/);
  });

  it("uses the AI Overview block, not organic results, for google_aio", () => {
    const r = parseCloro("google_aio", fixture("google-aio"));
    expect(r.text).toContain("Clifford Law");
    expect(r.citations[0]?.url).toBe("https://www.cliffordlaw.com/");
  });

  it("collapses Gemini's #:~:text= highlight links to one citation per page", () => {
    const raw = fixture("gemini-aeo").result.sources.length;
    const r = parseCloro("gemini", fixture("gemini-aeo"));
    expect(r.citations.length).toBeLessThan(raw);
  });

  it("google search without an aioverview key → NO_AI_RESULT", () => {
    const json = fixture("google-aio-aeo");
    delete json.result.aioverview;
    const r = parseCloro("google_aio", json);
    expect(r).toMatchObject({ status: "NO_AI_RESULT", text: null });
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations.every((c) => c.searchResult)).toBe(true);
  });

  it("short answer with no sources (canned refusal) → NO_AI_RESULT", () => {
    const r = parseCloro("gemini", { result: { text: "I can't help with that right now.", sources: [] } });
    expect(r.status).toBe("NO_AI_RESULT");
  });

  it("perplexity: fan-out from search_model_queries, [cite ] stripped", () => {
    const r = parseCloro("perplexity", fixture("perplexity-from-docs"));
    expect(r.fanout).toEqual([
      { query: "best laptops for programming 2026", kind: "WEB", sequence: 1 },
      { query: "thinkpad x1 carbon linux developer review", kind: "WEB", sequence: 2 },
    ]);
    expect(r.text).not.toContain("[cite ]");
    expect(r.citations[0]).toEqual({ url: "https://techcrunch.com/laptops", title: "Best Programming Laptops 2026 — TechCrunch", position: 1 });
    expect(r.citations[2]?.title).toBeUndefined();
  });
});

describe("parseCloroSerp", () => {
  it("reads People-also-ask questions and related searches from a recorded Google response", () => {
    const r = parseCloroSerp(fixture("google-aio-aeo"));
    expect(r.questions[0]).toBe("What is the best software for answer engine optimization?");
    expect(r.questions).toHaveLength(4);
    expect(r.related).toContain("Best answer engine optimization agencies in usa");
  });
});

describe("cloroError", () => {
  it("engine unavailable (recorded 400) is not retryable, so the job moves to the fallback", () => {
    const e = cloroError(400, fixture("perplexity-unavailable"));
    expect(e).toMatchObject({ retryable: false, code: "MODEL_UNAVAILABLE", status: 400 });
  });
  it("429 and 5xx retry; auth and credit errors do not", () => {
    expect(cloroError(429, {}).retryable).toBe(true);
    expect(cloroError(503, {}).retryable).toBe(true);
    expect(cloroError(401, {}).retryable).toBe(false);
    expect(cloroError(403, { error: { code: "INSUFFICIENT_CREDITS" } }).retryable).toBe(false);
  });
});

describe("cleanUrl", () => {
  it("strips tracking params and text fragments, keeps real params", () => {
    expect(cleanUrl("https://a.com/p?utm_source=chatgpt.com&id=7#:~:text=hi")).toBe("https://a.com/p?id=7");
    expect(cleanUrl("https://youtube.com/watch?v=x&t=16")).toBe("https://youtube.com/watch?v=x&t=16");
  });
});

describe("citation pills", () => {
  it("AI Mode keeps every page from `sources` and `citationPills`", () => {
    const raw = fixture("aimode-aeo") as { result: { sources: { url: string }[]; citationPills: { url: string }[] } };
    const expected = new Set([...raw.result.sources, ...raw.result.citationPills].map((s) => cleanUrl(s.url)));
    const r = parseCloro("google_ai_mode", raw);
    expect(new Set(r.citations.map((c) => c.url))).toEqual(expected);
  });
});

describe("Google search results", () => {
  it("AI Overview checks keep Google's blue links after the AI's own sources, flagged as search results", () => {
    const raw = fixture("google-aio-aeo") as { result: { organicResults?: { link: string }[] } };
    const r = parseCloro("google_aio", raw);
    const ai = r.citations.filter((c) => !c.searchResult);
    const search = r.citations.filter((c) => c.searchResult);
    expect(ai.length).toBeGreaterThan(0);
    expect(search.length).toBe(new Set((raw.result.organicResults ?? []).map((o) => cleanUrl(o.link))).size - ai.filter((c) => (raw.result.organicResults ?? []).some((o) => cleanUrl(o.link) === c.url)).length);
    expect(r.citations.map((c) => c.position)).toEqual(r.citations.map((_, i) => i + 1));
    expect(r.citations.findIndex((c) => c.searchResult)).toBe(ai.length);
  });
  it("still records search results when Google showed no AI Overview", () => {
    const r = parseCloro("google_aio", { result: { organicResults: [{ link: "https://www.facebook.com/groups/x/posts/1", title: "Q" }] } } as never);
    expect(r.status).toBe("NO_AI_RESULT");
    expect(r.citations).toEqual([{ url: "https://www.facebook.com/groups/x/posts/1", title: "Q", position: 1, searchResult: true }]);
  });
  it("other engines never get search results", () => {
    expect(parseCloro("chatgpt", fixture("chatgpt-aeo")).citations.some((c) => c.searchResult)).toBe(false);
  });
});
