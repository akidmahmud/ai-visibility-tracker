/** AI crawlers and assistant fetchers by user-agent token, with what each one does. Order: most specific first. */
export const AI_BOTS: { name: string; token: RegExp; owner: string; purpose: "training" | "search" | "user" }[] = [
  { name: "OAI-SearchBot", token: /OAI-SearchBot/i, owner: "OpenAI", purpose: "search" },
  { name: "ChatGPT-User", token: /ChatGPT-User/i, owner: "OpenAI", purpose: "user" },
  { name: "GPTBot", token: /GPTBot/i, owner: "OpenAI", purpose: "training" },
  { name: "Claude-SearchBot", token: /Claude-SearchBot/i, owner: "Anthropic", purpose: "search" },
  { name: "Claude-User", token: /Claude-User/i, owner: "Anthropic", purpose: "user" },
  { name: "ClaudeBot", token: /ClaudeBot|anthropic-ai/i, owner: "Anthropic", purpose: "training" },
  { name: "Perplexity-User", token: /Perplexity-User/i, owner: "Perplexity", purpose: "user" },
  { name: "PerplexityBot", token: /PerplexityBot/i, owner: "Perplexity", purpose: "search" },
  { name: "Google-CloudVertexBot", token: /Google-CloudVertexBot/i, owner: "Google", purpose: "user" },
  { name: "Gemini-Deep-Research", token: /Gemini-Deep-Research/i, owner: "Google", purpose: "user" },
  { name: "MistralAI-User", token: /MistralAI-User/i, owner: "Mistral", purpose: "user" },
  { name: "DuckAssistBot", token: /DuckAssistBot/i, owner: "DuckDuckGo", purpose: "search" },
  { name: "meta-externalagent", token: /meta-external(agent|fetcher)/i, owner: "Meta", purpose: "training" },
  { name: "Amazonbot", token: /Amazonbot/i, owner: "Amazon", purpose: "search" },
  { name: "Applebot", token: /Applebot/i, owner: "Apple", purpose: "search" },
  { name: "Bytespider", token: /Bytespider/i, owner: "ByteDance", purpose: "training" },
  { name: "CCBot", token: /CCBot/i, owner: "Common Crawl", purpose: "training" },
  { name: "cohere-ai", token: /cohere-ai|cohere-training/i, owner: "Cohere", purpose: "training" },
];

const AI_REFERRERS: [RegExp, string][] = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$|^openai$/i, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/i, "Perplexity"],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/i, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$|(^|\.)copilot\.cloud\.microsoft$/i, "Copilot"],
  [/(^|\.)claude\.ai$/i, "Claude"],
  [/(^|\.)chat\.deepseek\.com$/i, "DeepSeek"],
  [/(^|\.)meta\.ai$/i, "Meta AI"],
  [/(^|\.)grok\.com$/i, "Grok"],
  [/(^|\.)chat\.mistral\.ai$/i, "Mistral"],
  [/(^|\.)you\.com$/i, "You.com"],
];

/** The AI assistant a GA4 session source / referrer host belongs to, or null. */
export function aiReferrer(source: string): string | null {
  const host = source.toLowerCase().replace(/^https?:\/\//, "").split("/")[0]!;
  return AI_REFERRERS.find(([re]) => re.test(host))?.[1] ?? null;
}

/** The AI bot behind a user agent, or null for anything else (browsers, Googlebot, Bingbot, …). */
export function aiBot(userAgent: string): string | null {
  return AI_BOTS.find((b) => b.token.test(userAgent))?.name ?? null;
}
