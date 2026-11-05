import { describe, expect, it } from "vitest";
import { aiResultRate, avgPosition, mentionRate, score, sentimentPct, shareOfVoice, trend, visibility } from "./scoring";

describe("score", () => {
  it("4 brands named, you're 2nd → 75", () => expect(score(2, 4)).toBe(75));
  it("first of one → 100, last of four → 25", () => {
    expect(score(1, 1)).toBe(100);
    expect(score(4, 4)).toBe(25);
  });
  it("rounds", () => expect(score(2, 3)).toBe(67));
  it("invalid rank → 0", () => {
    expect(score(0, 4)).toBe(0);
    expect(score(5, 4)).toBe(0);
  });
});

describe("visibility / mentionRate", () => {
  const answers = [
    { status: "OK" as const, rank: 2, total: 4 }, // 75
    { status: "OK" as const, rank: null, total: 3 }, // 0
    { status: "NO_AI_RESULT" as const }, // excluded
    { status: "FAILED" as const }, // excluded
  ];
  it("excludes NO_AI_RESULT and FAILED from the denominator", () => expect(visibility(answers)).toBe(37.5));
  it("mention rate over OK answers", () => expect(mentionRate(answers)).toBe(0.5));
  it("AI result rate ignores failures", () => expect(aiResultRate(answers)).toBeCloseTo(2 / 3));
  it("null with no OK answers", () => expect(visibility([{ status: "FAILED" }])).toBeNull());
});

describe("trend", () => {
  it("needs ≥ 4 points", () => expect(trend([1, 2, 3])).toBeNull());
  it("up when recent half ≥ 5 above older", () => expect(trend([10, 10, 20, 20])).toEqual({ delta: 10, direction: "up" }));
  it("down", () => expect(trend([20, 20, 10, 10])?.direction).toBe("down"));
  it("stable under 5", () => expect(trend([10, 10, 14, 14])?.direction).toBe("stable"));
  it("odd length ignores the middle point", () => expect(trend([10, 10, 99, 20, 20])?.delta).toBe(10));
});

describe("misc", () => {
  it("avgPosition", () => expect(avgPosition([1, 2, 3])).toBe(2));
  it("sentimentPct", () => expect(sentimentPct({ positive: 3, neutral: 1, negative: 0 })).toBe(0.75));
  it("shareOfVoice", () => expect(shareOfVoice(1, 4)).toBe(0.25));
});
