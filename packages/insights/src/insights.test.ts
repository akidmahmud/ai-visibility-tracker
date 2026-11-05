import { describe, expect, it } from "vitest";
import { fanoutToSuggestions, mergeSuggestions, searchConsoleToSuggestions } from "./suggestions";
import { type InsightInput, priorityOf, rank, runRules, siteCheckCandidates } from "./rules";
import { jsonLdTypes, robotsBlocksRoot } from "./site-check";

const base: InsightInput = {
  brandName: "AEO Collective",
  runs: 4,
  prompts: [],
  models: [],
  overallVisibility: 40,
  topics: [],
  citedNotYou: [],
  siteTypeShare: {},
  forumDomains: [],
  videoDomains: [],
  negative: { pct: 0, mentions: 0, summaries: [] },
  siteCheck: null,
};
const rules = (i: Partial<InsightInput>) => runRules({ ...base, ...i });

describe("rules", () => {
  it("cited-not-you needs ≥ 2 citations and records the evidence", () => {
    const out = rules({ citedNotYou: [{ domain: "clutch.co", count: 3, rivals: ["Cited Co"] }, { domain: "x.com", count: 1, rivals: ["A"] }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ruleId: "cited-not-you", subject: "clutch.co", gapPoints: 30, evidence: { citations: 3, rivalsRecommended: ["Cited Co"] } });
  });

  it("zero-prompt: a prompt never recommended across the runs, weighted by its intent", () => {
    const prompts = [
      { promptId: "p1", text: "best aeo agency phoenix", intent: "COMMERCIAL" as const, topic: null, answers: 12, visibility: 0 },
      { promptId: "p2", text: "what is aeo", intent: "INFORMATIONAL" as const, topic: null, answers: 12, visibility: 0 },
      { promptId: "p3", text: "covered", intent: "COMMERCIAL" as const, topic: null, answers: 12, visibility: 40 },
    ];
    const out = rank(rules({ prompts }));
    expect(out.map((c) => [c.subject, c.priority])).toEqual([
      ["p1", "HIGH"],
      ["p2", "HIGH"],
    ]);
    expect(out[1]!.score).toBe(50); // 100 × informational 0.5
    expect(rules({ prompts, runs: 1 })).toHaveLength(0); // too early to call
  });

  it("competitor-beats-you on a topic (≥ 15 points) and model-gap (≥ 20 below average)", () => {
    const out = rules({
      topics: [
        { topic: "Phoenix", intent: "COMMERCIAL", you: 20, rivals: [{ name: "Cited Co", visibility: 50 }, { name: "B", visibility: 10 }] },
        { topic: "Tucson", intent: "COMMERCIAL", you: 40, rivals: [{ name: "C", visibility: 50 }] },
      ],
      models: [
        { model: "chatgpt", answers: 10, visibility: 15 },
        { model: "gemini", answers: 10, visibility: 65 },
      ],
    });
    expect(out.map((c) => [c.ruleId, c.subject, c.gapPoints])).toEqual([
      ["competitor-beats-you", "Phoenix|Cited Co", 30],
      ["model-gap", "chatgpt", 25],
    ]);
  });

  it("forum, video and negative-sentiment shares", () => {
    const out = rules({
      siteTypeShare: { "Forums & Communities": 0.25, Video: 0.05 },
      forumDomains: ["reddit.com"],
      negative: { pct: 0.3, mentions: 10, summaries: ["Too expensive"] },
    });
    expect(out.map((c) => c.ruleId)).toEqual(["forum-source", "negative-sentiment"]);
  });

  it("site checkup: one todo per failing check, none when the site is unreachable", () => {
    const failing = { checkedAt: "x", homepageReachable: true, blockedBots: ["GPTBot"], hasLlmsTxt: false, hasOrganizationSchema: true, hasFaqSchema: false };
    expect(siteCheckCandidates(failing).map((c) => c.subject)).toEqual(["robots-ai-bots", "llms-txt", "faq-schema"]);
    expect(siteCheckCandidates({ ...failing, homepageReachable: false })).toEqual([]);
  });

  it("priority buckets", () => {
    expect(priorityOf({ gapPoints: 60, intent: "COMMERCIAL" }).priority).toBe("HIGH");
    expect(priorityOf({ gapPoints: 60, intent: "INFORMATIONAL" }).priority).toBe("MEDIUM");
    expect(priorityOf({ gapPoints: 20, intent: "COMMERCIAL" }).priority).toBe("LOW");
  });
});

describe("robotsBlocksRoot", () => {
  it("most specific group wins; longest rule wins; Allow wins ties", () => {
    const robots = "User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\nAllow: /\n";
    expect(robotsBlocksRoot(robots, "GPTBot")).toBe(true);
    expect(robotsBlocksRoot(robots, "ClaudeBot")).toBe(false);
    expect(robotsBlocksRoot(robots, "PerplexityBot")).toBe(false); // falls back to *, which only blocks /admin
    expect(robotsBlocksRoot("User-agent: *\nDisallow: /", "Google-Extended")).toBe(true);
    expect(robotsBlocksRoot("User-agent: *\nDisallow:", "GPTBot")).toBe(false); // empty Disallow allows all
    expect(robotsBlocksRoot("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /", "ClaudeBot")).toBe(true); // shared group
  });
});

describe("jsonLdTypes", () => {
  it("finds types in @graph, arrays and mainEntity; ignores broken blocks", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebPage"],"mainEntity":{"@type":"FAQPage"}}]}</script>
      <script type="application/ld+json">{broken</script>`;
    expect([...jsonLdTypes(html)].sort()).toEqual(["FAQPage", "Organization", "WebPage"]);
  });
});

describe("suggestions", () => {
  it("drops near-duplicates of existing prompts and each other; commercial first", () => {
    const out = mergeSuggestions(
      ["Best AEO agency for Phoenix local business?"],
      [
        { text: "What is answer engine optimization?", intent: "INFORMATIONAL", source: "SUGGESTED", origin: "site" },
        { text: "Best AEO agency for a Phoenix local business", intent: "COMMERCIAL", source: "SUGGESTED", origin: "site" },
        { text: "Best AEO agency for a dentist in Mesa?", intent: "COMMERCIAL", source: "SUGGESTED", origin: "site" },
        { text: "best aeo agency for a dentist in mesa", intent: "COMMERCIAL", source: "FANOUT", origin: "ai-search" },
      ],
    );
    expect(out.map((s) => s.text)).toEqual(["Best AEO agency for a dentist in Mesa?", "What is answer engine optimization?"]);
  });
  it("Search Console: question-like queries only, own brand searches dropped, most searched first", () => {
    const out = searchConsoleToSuggestions(
      [
        { query: "aeo agency phoenix", impressions: 900 },
        { query: "what is answer engine optimization", impressions: 120 },
        { query: "best aeo agency for dentists", impressions: 300 },
        { query: "aeo collective reviews best", impressions: 999 },
      ],
      "AEO Collective",
    );
    expect(out.map((s) => [s.text, s.intent, s.source])).toEqual([
      ["Best aeo agency for dentists", "COMMERCIAL", "GSC"],
      ["What is answer engine optimization?", "INFORMATIONAL", "GSC"],
    ]);
  });

  it("fan-out queries: short keyword strings are skipped", () => {
    expect(fanoutToSuggestions(["aeo", "best aeo agency phoenix reviews"]).map((s) => [s.text, s.intent])).toEqual([["Best aeo agency phoenix reviews", "COMMERCIAL"]]);
  });
});
