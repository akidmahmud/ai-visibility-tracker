export type Kind = "SELF" | "COMPETITOR" | "UNTRACKED";

export type EntityRow = {
  entityId: string;
  name: string;
  domain: string | null;
  kind: Kind;
  answers: number;
  mentions: number;
  visibility: number | null;
  mentionRate: number | null;
  avgPosition: number | null;
  sentimentPct: number | null;
  negativePct: number | null;
  shareOfVoice: number | null;
};

export type Summary = {
  days: number;
  brand: (EntityRow & { noAiResult: number; aiResultRate: number | null; trend: { delta: number; direction: "up" | "down" | "stable" } | null }) | null;
  entities: EntityRow[];
};

export type Timeseries = {
  days: string[];
  series: { entityId: string; name: string; kind: Kind; points: { day: string; visibility: number | null }[] }[];
  providerChanges: { day: string; model: string }[];
  peekaboo?: { day: string; score: number }[];
};

export type Heatmap = { models: string[]; rows: { entityId: string; name: string; kind: Kind; cells: { model: string; visibility: number | null }[] }[] };

export type PromptMetrics = {
  columns: { entityId: string; name: string; kind: Kind }[];
  prompts: {
    id: string;
    text: string;
    intent: string;
    topicId: string | null;
    topic: string | null;
    location: string | null;
    isActive: boolean;
    answers: number;
    citations: number;
    visibility: number | null;
    mentionRate: number | null;
    avgPosition: number | null;
    matrix: (number | null)[];
  }[];
};

export type SourceRow = {
  domain: string;
  url: string | null;
  title: string | null;
  count: number;
  share: number | null;
  owner: "SELF" | "COMPETITOR" | "THIRD_PARTY";
  siteType: string;
  pageType: string | null;
  answers: number;
  /** citations that were Google blue links shown with an AI Overview check, not pages the AI cited */
  searchCount: number;
  lastSeen: string;
  byModel: Record<string, number>;
};
export type Sources = {
  total: number;
  searchTotal: number;
  view: "domains" | "urls";
  domains: SourceRow[];
  bySiteType: { type: string; count: number }[];
  byPageType: { type: string; count: number }[];
  trend: { day: string; key: string; count: number }[];
};

export type AnswerList = {
  total: number;
  page: number;
  pageSize: number;
  answers: {
    id: string;
    model: string;
    status: "OK" | "NO_AI_RESULT" | "FAILED";
    provider: string;
    prompt: string;
    capturedAt: string;
    excerpt: string | null;
    citations: number;
    selfRank: number | null;
  }[];
};
