import { describe, expect, it } from "vitest";
import { parseClaude } from "./claude";

// Shape of a Messages API response with web_search_20260209 (server_tool_use → web_search_tool_result → cited text).
const msg = {
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  usage: { input_tokens: 10000, output_tokens: 1000, server_tool_use: { web_search_requests: 2 } },
  content: [
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "best AEO agencies 2026" } },
    { type: "web_search_tool_result", tool_use_id: "s1", content: [
      { type: "web_search_result", url: "https://a.com/x?utm_source=y", title: "A" },
      { type: "web_search_result", url: "https://b.com/", title: "B" },
    ] },
    { type: "server_tool_use", id: "s2", name: "web_search", input: { query: "AEO Collective reviews" } },
    { type: "web_search_tool_result", tool_use_id: "s2", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
    { type: "text", text: "Top picks: " },
    { type: "text", text: "AEO Collective.", citations: [{ type: "web_search_result_location", url: "https://b.com/", title: "B", cited_text: "…", encrypted_index: "" }] },
  ],
} as never;

describe("parseClaude", () => {
  it("text, cited sources first, search queries, cost", () => {
    const r = parseClaude([msg]);
    expect(r.status).toBe("OK");
    expect(r.text).toBe("Top picks: AEO Collective.");
    expect(r.citations.map((c) => c.url)).toEqual(["https://b.com/", "https://a.com/x"]);
    expect(r.fanout.map((f) => f.query)).toEqual(["best AEO agencies 2026", "AEO Collective reviews"]);
    expect(r.cost.usd).toBeCloseTo(0.04 + 0.02 + 0.02, 6);
  });
  it("no text → NO_AI_RESULT", () => {
    expect(parseClaude([{ ...(msg as object), content: [] } as never]).status).toBe("NO_AI_RESULT");
  });
});
