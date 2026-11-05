import { describe, expect, it } from "vitest";
import { nextRunAt } from "./schedule";

const from = new Date("2026-11-03T12:00:00Z");
const H = 3600 * 1000;

describe("nextRunAt", () => {
  it("weekly with no jitter is exactly 7 days later", () => {
    expect(nextRunAt("WEEKLY", from, () => 0.5).toISOString()).toBe("2026-11-10T12:00:00.000Z");
  });
  it("jitter stays within ±2h", () => {
    const base = from.getTime() + 24 * H;
    expect(nextRunAt("DAILY", from, () => 0).getTime()).toBe(base - 2 * H);
    expect(nextRunAt("DAILY", from, () => 0.999999).getTime()).toBeLessThan(base + 2 * H);
  });
});
