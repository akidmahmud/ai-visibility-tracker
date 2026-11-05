import type { RunFrequency } from "./schemas";

const DAY = 24 * 3600 * 1000;
const JITTER = 2 * 3600 * 1000;

const INTERVAL_DAYS: Record<RunFrequency, number> = {
  DAILY: 1,
  EVERY_2_DAYS: 2,
  EVERY_3_DAYS: 3,
  WEEKLY: 7,
  MONTHLY: 30,
};

/** Next scheduled run: one interval after `from`, jittered ±2h so brands don't all fire together. */
export function nextRunAt(frequency: RunFrequency, from: Date, random: () => number = Math.random): Date {
  const jitter = (random() * 2 - 1) * JITTER;
  return new Date(from.getTime() + INTERVAL_DAYS[frequency] * DAY + jitter);
}

// BullMQ queue names (no ':' — BullMQ reserves it). Capture queues are per provider: `capture-cloro`, ...
export const QUEUE = { runs: "runs", maintenance: "maintenance", capture: (provider: string) => `capture-${provider}` } as const;
