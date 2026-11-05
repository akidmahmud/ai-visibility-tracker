export const ENGINES: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google_aio: "AI Overview",
  google_ai_mode: "AI Mode",
  copilot: "Copilot",
  claude: "Claude",
};
export const TRACKED_ENGINES = ["chatgpt", "gemini", "perplexity", "google_aio", "google_ai_mode", "copilot", "claude"];

export const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
export const vis = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toString());
export const pos = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(1));
export const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const fmtDateTime = (d: string | Date) => new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export const KIND_LABEL = { SELF: "You", COMPETITOR: "Competitor", UNTRACKED: "Not tracked" } as const;
export const OWNER_LABEL = { SELF: "Your site", COMPETITOR: "Competitor", THIRD_PARTY: "Third party" } as const;

export const INTENTS: Record<string, string> = {
  COMMERCIAL: "Commercial",
  INVESTIGATIONAL: "Investigational",
  INFORMATIONAL: "Informational",
  NAVIGATIONAL: "Navigational",
};

/** Global filters live in the URL so every view is shareable (handoff §13). */
export type Filters = { days: number; models: string[]; topics: string[]; intents: string[] };

/** URL params the filter bar owns; tabs carry them across pages. */
export const FILTER_PARAMS = ["days", "models", "topics", "intents"] as const;

export function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const days = Number(sp.days);
  const list = (v: unknown) => (typeof v === "string" ? v.split(",").filter(Boolean) : []);
  return {
    days: [7, 30, 90].includes(days) ? days : 30,
    models: list(sp.models).filter((m) => m in ENGINES),
    topics: list(sp.topics),
    intents: list(sp.intents).filter((i) => i in INTENTS),
  };
}

export function filterQuery(f: Filters, extra: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams({ days: String(f.days) });
  if (f.models.length) p.set("models", f.models.join(","));
  if (f.topics.length) p.set("topics", f.topics.join(","));
  if (f.intents.length) p.set("intents", f.intents.join(","));
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}
