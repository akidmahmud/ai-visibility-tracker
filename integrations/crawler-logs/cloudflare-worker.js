// AI crawler logs: Cloudflare Worker (handoff §15 Phase 6).
// Deploy on the client's zone with a route like "example.com/*". Settings → Variables:
//   INGEST_URL  = https://<app domain>/api/public/crawler-hits
//   CRAWLER_KEY = the brand's key from the "AI crawlers" tab (secret)
// Every request passes through to the origin unchanged; AI-bot visits are reported in the background,
// in small batches, without slowing the response.

const AI_BOT = /GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai|PerplexityBot|Perplexity-User|Google-CloudVertexBot|Gemini-Deep-Research|MistralAI-User|DuckAssistBot|meta-external(agent|fetcher)|Amazonbot|Applebot|Bytespider|CCBot|cohere-ai/i;

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const ua = request.headers.get("user-agent") || "";
    if (AI_BOT.test(ua) && env.INGEST_URL && env.CRAWLER_KEY) {
      const url = new URL(request.url);
      ctx.waitUntil(
        fetch(env.INGEST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Crawler-Key": env.CRAWLER_KEY },
          body: JSON.stringify({ hits: [{ ua, path: url.pathname, ts: new Date().toISOString() }] }),
        }).catch(() => {}),
      );
    }
    return response;
  },
};
