import { describe, expect, it } from "vitest";
import { toBaseline, toBrand, toCompetitor, toPrompt } from "../src/integrations/peekaboo";

// Shapes from Peekaboo's REST API help page and its dashboard responses (Nov 2026); fields read defensively.
describe("Peekaboo import parsers", () => {
  it("prompts: promptText / searchIntent / category, with fallbacks", () => {
    expect(toPrompt({ promptText: "Best Arizona AEO agency?", searchIntent: "COMMERCIAL", category: "Phoenix" })).toEqual({
      text: "Best Arizona AEO agency?",
      intent: "COMMERCIAL",
      category: "Phoenix",
    });
    expect(toPrompt({ text: "x prompt", category: { name: "General" } })).toEqual({ text: "x prompt", intent: null, category: "General" });
    expect(toPrompt({ promptText: "  " })).toBeNull();
  });
  it("brands and competitors", () => {
    expect(toBrand({ id: "b1", name: "AEO Collective", url: "https://aeo-collective.com/", analysisFrequency: "WEEKLY" })).toMatchObject({ id: "b1", url: "https://aeo-collective.com/" });
    expect(toBrand({ id: "b1", name: "No URL" })).toBeNull();
    expect(toCompetitor({ name: "Minuttia", url: null })).toEqual({ name: "Minuttia", url: null });
  });
  it("baseline: daily scores, unmeasured (null) days skipped", () => {
    expect(
      toBaseline({ series: [{ date: "2026-10-01", score: 13 }, { date: "2026-10-02", score: null }, { date: "2026-10-03T00:00:00Z", score: 26 }] }, "AEO Collective"),
    ).toEqual([
      { day: "2026-10-01", score: 13 },
      { day: "2026-10-03", score: 26 },
    ]);
    expect(toBaseline({ timeSeries: [{ date: "2026-09-28", "AEO Collective": 13, Minuttia: 0 }] }, "AEO Collective")).toEqual([{ day: "2026-09-28", score: 13 }]);
  });
});
