import { describe, expect, it } from "vitest";
import { aiBot, aiReferrer } from "./ai-bots";
import { normalizeName } from "./normalize";
import { jaroWinkler } from "./similarity";
import { siteType } from "./site-type";

describe("siteType", () => {
  it("known domains and their subdomains; unknown → Other", () => {
    expect(siteType("reddit.com")).toBe("Forums & Communities");
    expect(siteType("old.reddit.com")).toBe("Forums & Communities");
    expect(siteType("agencies.semrush.com")).toBe("Reviews & Directories");
    expect(siteType("aeo-collective.com")).toBe("Other");
  });
});

describe("jaroWinkler", () => {
  it("matches the textbook values", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("dwayne", "duane")).toBeCloseTo(0.84, 2);
    expect(jaroWinkler("dixon", "dicksonx")).toBeCloseTo(0.813, 3);
  });
  it("identical → 1, nothing shared → 0", () => {
    expect(jaroWinkler("acme", "acme")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
    expect(jaroWinkler("", "x")).toBe(0);
  });
  it("same firm with a small variation clears 0.93; different firms don't", () => {
    expect(jaroWinkler(normalizeName("Clifford Law Offices"), normalizeName("Clifford Law Office"))).toBeGreaterThanOrEqual(0.93);
    expect(jaroWinkler(normalizeName("Apple"), normalizeName("Apple Hospitality"))).toBeLessThan(0.93);
  });
});


describe("aiReferrer", () => {
  it("maps GA4 session sources to AI assistants", () => {
    expect(aiReferrer("chatgpt.com")).toBe("ChatGPT");
    expect(aiReferrer("perplexity.ai")).toBe("Perplexity");
    expect(aiReferrer("gemini.google.com")).toBe("Gemini");
    expect(aiReferrer("www.google.com")).toBeNull();
    expect(aiReferrer("(direct)")).toBeNull();
  });
});

describe("aiBot", () => {
  it("names AI crawlers from real user agents, ignores search engines and browsers", () => {
    expect(aiBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot")).toBe("GPTBot");
    expect(aiBot("Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)")).toBe("OAI-SearchBot");
    expect(aiBot("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")).toBe("ClaudeBot");
    expect(aiBot("Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)")).toBe("PerplexityBot");
    expect(aiBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBeNull();
    expect(aiBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36")).toBeNull();
  });
});

describe("pageType", () => {
  it("classifies common page shapes from URL and title", async () => {
    const { pageType } = await import("./site-type");
    expect(pageType("https://aeo-collective.com/")).toBe("Home Page");
    expect(pageType("https://x.com/a", "Best 10 AEO agencies in 2026")).toBe("Listicle");
    expect(pageType("https://divorce.law/guides/divorce-mediation/kansas/", "Divorce Mediation in Kansas")).toBe("Guide");
    expect(pageType("https://ksrevisor.gov/statutes/chapters/ch23/023_035.html", "23-3502")).toBe("Reference");
    expect(pageType("https://attorneys.superlawyers.com/mediation/kansas/", "Best Olathe Mediation Attorneys")).toBe("Listicle");
    expect(pageType("https://www.kansaslegalservices.org/mediation-services", "Mediation Services")).toBe("Product Page");
    expect(pageType("https://www.reddit.com/r/law/comments/x")).toBe("Forum Thread");
    expect(pageType("https://site.com/blog/why-aeo")).toBe("Blog Post");
    expect(pageType("https://site.com/some-page", "Something")).toBe("Article");
  });
});
