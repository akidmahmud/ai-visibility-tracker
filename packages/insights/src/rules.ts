import type { Intent, ModelTag } from "@avt/shared";

// Rules engine (handoff §10). Pure: the worker computes InsightInput from the last few runs, rules turn it into
// ranked candidates with the numbers that triggered them. The LLM only rewrites the wording afterwards.

export type TodoType = "ON_PAGE" | "OFF_PAGE" | "TECHNICAL";
export type Priority = "HIGH" | "MEDIUM" | "LOW";

export type SiteCheckResults = {
  checkedAt: string;
  blockedBots: string[]; // AI crawlers robots.txt disallows on "/"
  hasLlmsTxt: boolean;
  hasOrganizationSchema: boolean;
  hasFaqSchema: boolean;
  homepageReachable: boolean;
};

export type InsightInput = {
  brandName: string;
  runs: number; // runs the numbers below cover (at most 4)
  prompts: { promptId: string; text: string; intent: Intent; topic: string | null; answers: number; visibility: number }[];
  models: { model: ModelTag; answers: number; visibility: number }[];
  overallVisibility: number;
  /** Visibility of you and each rival per topic ("All prompts" when the brand uses no topics). */
  topics: { topic: string; intent: Intent; you: number; rivals: { name: string; visibility: number }[] }[];
  /** Domains cited in answers that recommend a rival but never in answers that recommend you. */
  citedNotYou: { domain: string; count: number; rivals: string[] }[];
  siteTypeShare: Record<string, number>; // share of all citations per site type (0–1)
  forumDomains: string[];
  videoDomains: string[];
  negative: { pct: number; mentions: number; summaries: string[] };
  siteCheck: SiteCheckResults | null;
};

export type Candidate = {
  ruleId: string;
  subject: string; // with ruleId, the dedupe key across weeks
  type: TodoType;
  category: string;
  effort: "S" | "M" | "L";
  gapPoints: number; // 0–100, visibility points (or equivalent) at stake
  intent: Intent;
  models: ModelTag[];
  title: string; // default wording; the LLM may rewrite it
  detail: string;
  evidence: Record<string, unknown>;
};

export const THRESHOLDS = {
  citedNotYouMin: 2, // citations before a domain counts as a gap
  competitorGap: 15, // visibility points a rival must lead by
  modelGap: 20, // points below your average on one engine
  forumShare: 0.1,
  videoShare: 0.1,
  negativeShare: 0.2,
  zeroPromptRuns: 2, // runs with no visibility before a prompt is flagged (spec: 4; fewer runs early on)
  minEngineAnswers: 3, // answers on an engine before its gap counts
};

const INTENT_WEIGHT: Record<Intent, number> = { COMMERCIAL: 1, INVESTIGATIONAL: 0.8, INFORMATIONAL: 0.5, NAVIGATIONAL: 0.5 };

/** priority = gapPoints × intent weight, bucketed. */
export function priorityOf(c: Pick<Candidate, "gapPoints" | "intent">): { score: number; priority: Priority } {
  const score = c.gapPoints * INTENT_WEIGHT[c.intent];
  return { score, priority: score >= 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW" };
}

const ENGINE: Record<string, string> = { chatgpt: "ChatGPT", gemini: "Gemini", perplexity: "Perplexity", google_aio: "Google AI Overview", google_ai_mode: "Google AI Mode", copilot: "Copilot", claude: "Claude" };

const round = (n: number) => Math.round(n);
const pctText = (n: number) => `${Math.round(n * 100)}%`;

export function runRules(i: InsightInput): Candidate[] {
  const out: Candidate[] = [];

  for (const c of i.citedNotYou.filter((x) => x.count >= THRESHOLDS.citedNotYouMin)) {
    out.push({
      ruleId: "cited-not-you",
      subject: c.domain,
      type: "OFF_PAGE",
      category: "Backlinks & PR",
      effort: "M",
      gapPoints: Math.min(100, c.count * 10),
      intent: "COMMERCIAL",
      models: [],
      title: `Get listed on ${c.domain}`,
      detail: `AI answers that recommend ${c.rivals.slice(0, 3).join(", ")} cite ${c.domain}, but no answer that recommends ${i.brandName} does.`,
      evidence: { domain: c.domain, citations: c.count, rivalsRecommended: c.rivals },
    });
  }

  if (i.runs >= THRESHOLDS.zeroPromptRuns) {
    for (const p of i.prompts.filter((x) => x.answers > 0 && x.visibility === 0)) {
      out.push({
        ruleId: "zero-prompt",
        subject: p.promptId,
        type: "ON_PAGE",
        category: "Content",
        effort: "M",
        gapPoints: 100,
        intent: p.intent,
        models: [],
        title: `Create a page answering "${p.text}"`,
        detail: `${i.brandName} was not recommended in any of ${p.answers} AI answers to this question across the last ${i.runs} runs.`,
        evidence: { prompt: p.text, answers: p.answers, visibility: 0, runs: i.runs },
      });
    }
  }

  for (const t of i.topics) {
    const rival = [...t.rivals].sort((a, b) => b.visibility - a.visibility)[0];
    if (!rival || rival.visibility - t.you < THRESHOLDS.competitorGap) continue;
    const gap = rival.visibility - t.you;
    out.push({
      ruleId: "competitor-beats-you",
      subject: `${t.topic}|${rival.name}`,
      type: "ON_PAGE",
      category: "Comparison content",
      effort: "M",
      gapPoints: Math.min(100, gap),
      intent: t.intent,
      models: [],
      title: `Publish ${i.brandName} vs ${rival.name} comparison`,
      detail: `On "${t.topic}" prompts, ${rival.name} scores ${round(rival.visibility)} visibility against your ${round(t.you)}.`,
      evidence: { topic: t.topic, you: round(t.you), rival: rival.name, rivalVisibility: round(rival.visibility), gap: round(gap) },
    });
  }

  for (const m of i.models.filter((x) => x.answers >= THRESHOLDS.minEngineAnswers && i.overallVisibility - x.visibility >= THRESHOLDS.modelGap)) {
    const gap = i.overallVisibility - m.visibility;
    out.push({
      ruleId: "model-gap",
      subject: m.model,
      type: "OFF_PAGE",
      category: "Engine coverage",
      effort: "L",
      gapPoints: Math.min(100, gap),
      intent: "COMMERCIAL",
      models: [m.model],
      title: `Improve presence on the sources ${ENGINE[m.model] ?? m.model} cites`,
      detail: `Your visibility on ${ENGINE[m.model] ?? m.model} is ${round(m.visibility)}, ${round(gap)} points below your ${round(i.overallVisibility)} average.`,
      evidence: { model: m.model, visibility: round(m.visibility), average: round(i.overallVisibility), gap: round(gap), answers: m.answers },
    });
  }

  const forum = i.siteTypeShare["Forums & Communities"] ?? 0;
  if (forum >= THRESHOLDS.forumShare) {
    out.push({
      ruleId: "forum-source",
      subject: "forums",
      type: "OFF_PAGE",
      category: "Community",
      effort: "M",
      gapPoints: Math.min(100, forum * 100 * 2),
      intent: "COMMERCIAL",
      models: [],
      title: "Take part in the threads AI cites",
      detail: `${pctText(forum)} of the sources AI cites for your prompts are forums such as ${i.forumDomains.slice(0, 3).join(", ")}.`,
      evidence: { share: Number(forum.toFixed(3)), domains: i.forumDomains.slice(0, 5) },
    });
  }

  const video = i.siteTypeShare.Video ?? 0;
  if (video >= THRESHOLDS.videoShare) {
    out.push({
      ruleId: "video-source",
      subject: "video",
      type: "ON_PAGE",
      category: "Video",
      effort: "L",
      gapPoints: Math.min(100, video * 100 * 2),
      intent: "COMMERCIAL",
      models: [],
      title: "Make videos for these questions",
      detail: `${pctText(video)} of cited sources are videos (${i.videoDomains.slice(0, 2).join(", ")}).`,
      evidence: { share: Number(video.toFixed(3)), domains: i.videoDomains.slice(0, 5) },
    });
  }

  if (i.negative.mentions > 0 && i.negative.pct >= THRESHOLDS.negativeShare) {
    out.push({
      ruleId: "negative-sentiment",
      subject: "sentiment",
      type: "OFF_PAGE",
      category: "Reputation",
      effort: "M",
      gapPoints: Math.min(100, i.negative.pct * 100 * 2),
      intent: "COMMERCIAL",
      models: [],
      title: "Address negative framing in AI answers",
      detail: `${pctText(i.negative.pct)} of the AI mentions of ${i.brandName} are negative. Examples: ${i.negative.summaries.slice(0, 2).join(" / ")}`,
      evidence: { negativeShare: Number(i.negative.pct.toFixed(3)), mentions: i.negative.mentions, examples: i.negative.summaries.slice(0, 3) },
    });
  }

  return [...out, ...siteCheckCandidates(i.siteCheck)];
}

/** Technical todos from the site checkup. Their subjects are stable so a passing check can close them. */
export function siteCheckCandidates(s: SiteCheckResults | null): Candidate[] {
  if (!s || !s.homepageReachable) return [];
  const base = { type: "TECHNICAL" as const, category: "Technical", effort: "S" as const, intent: "COMMERCIAL" as const, models: [] };
  const out: Candidate[] = [];
  if (s.blockedBots.length) {
    out.push({
      ...base,
      ruleId: "site-check",
      subject: "robots-ai-bots",
      gapPoints: 90,
      title: `Allow AI crawlers in robots.txt (${s.blockedBots.join(", ")})`,
      detail: "robots.txt blocks crawlers that AI assistants use to read your site, so they can't cite it.",
      evidence: { blockedBots: s.blockedBots, checkedAt: s.checkedAt },
    });
  }
  if (!s.hasLlmsTxt) {
    out.push({ ...base, ruleId: "site-check", subject: "llms-txt", gapPoints: 30, title: "Add an /llms.txt file", detail: "An llms.txt file gives AI assistants a short, clean summary of your site and key pages.", evidence: { hasLlmsTxt: false, checkedAt: s.checkedAt } });
  }
  if (!s.hasOrganizationSchema) {
    out.push({ ...base, ruleId: "site-check", subject: "org-schema", gapPoints: 50, title: "Add Organization schema to the homepage", detail: "Organization JSON-LD tells AI who you are: name, logo, contact details and social profiles.", evidence: { hasOrganizationSchema: false, checkedAt: s.checkedAt } });
  }
  if (!s.hasFaqSchema) {
    out.push({ ...base, ruleId: "site-check", subject: "faq-schema", gapPoints: 25, title: "Add FAQ schema to answer common questions", detail: "FAQPage markup puts your answers to buyer questions in a format AI engines read directly.", evidence: { hasFaqSchema: false, checkedAt: s.checkedAt } });
  }
  return out;
}

/** All site-check subjects; any not raised by the latest check has passed and its todo can close. */
export const SITE_CHECK_SUBJECTS = ["robots-ai-bots", "llms-txt", "org-schema", "faq-schema"];

/** Ranked by priority score, deduped by ruleId + subject, capped (spec: top 15 per week). */
export function rank(candidates: Candidate[], limit = 15) {
  const seen = new Set<string>();
  return candidates
    .map((c) => ({ ...c, ...priorityOf(c) }))
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      const key = `${c.ruleId}|${c.subject}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
