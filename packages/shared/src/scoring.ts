// Peekaboo-compatible scoring (handoff §7). Pure functions only.

/** 1 = first brand named. 4 brands named, you're 2nd → 75. */
export function score(rank: number, total: number): number {
  if (total < 1 || rank < 1 || rank > total) return 0;
  return Math.round(((total - rank + 1) / total) * 100);
}

export type AnswerOutcome =
  | { status: "OK"; rank: number | null; total: number } // rank null = not mentioned
  | { status: "NO_AI_RESULT" | "FAILED" };

const ok = (as: AnswerOutcome[]) => as.filter((a): a is Extract<AnswerOutcome, { status: "OK" }> => a.status === "OK");

/** sum(score) / count(OK answers). NO_AI_RESULT and FAILED are excluded from the denominator. */
export function visibility(answers: AnswerOutcome[]): number | null {
  const oks = ok(answers);
  if (!oks.length) return null;
  return oks.reduce((s, a) => s + (a.rank ? score(a.rank, a.total) : 0), 0) / oks.length;
}

export function mentionRate(answers: AnswerOutcome[]): number | null {
  const oks = ok(answers);
  if (!oks.length) return null;
  return oks.filter((a) => a.rank).length / oks.length;
}

/** Share of searches where the engine showed an AI answer at all ("AI Overview shown in X%"). */
export function aiResultRate(answers: AnswerOutcome[]): number | null {
  const attempted = answers.filter((a) => a.status !== "FAILED");
  if (!attempted.length) return null;
  return attempted.filter((a) => a.status === "OK").length / attempted.length;
}

export function avgPosition(ranks: number[]): number | null {
  return ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null;
}

export function sentimentPct(c: { positive: number; neutral: number; negative: number }): number | null {
  const all = c.positive + c.neutral + c.negative;
  return all ? c.positive / all : null;
}

export type Trend = { delta: number; direction: "up" | "down" | "stable" };

/** mean(recent half) − mean(older half). Points are oldest-first. Needs ≥ 4 points. */
export function trend(points: number[]): Trend | null {
  if (points.length < 4) return null;
  const mid = Math.floor(points.length / 2);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const delta = mean(points.slice(points.length - mid)) - mean(points.slice(0, mid));
  return { delta, direction: delta >= 5 ? "up" : delta <= -5 ? "down" : "stable" };
}

export function shareOfVoice(entityMentions: number, allMentions: number): number | null {
  return allMentions ? entityMentions / allMentions : null;
}
