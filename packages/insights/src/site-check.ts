import type { SiteCheckResults } from "./rules";

/** Crawlers AI assistants use to read and cite pages. */
export const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"];

/**
 * Does robots.txt keep `agent` off the site root? Follows the robots.txt rules for group matching: the most
 * specific matching user-agent group wins (exact name over "*"), and within a group the longest matching
 * path rule wins, Allow beating Disallow on a tie.
 */
export function robotsBlocksRoot(robotsTxt: string, agent: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const name = agent.toLowerCase();
  const group = groups.find((g) => g.agents.includes(name)) ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return false;
  const matching = group.rules.filter((r) => r.path === "" || "/".startsWith(r.path.replace(/\*$/, "").replace(/\$$/, "")));
  if (!matching.length) return false;
  const best = matching.sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0]!;
  return !best.allow && best.path !== "";
}

/** JSON-LD @type values on a page, including inside @graph and arrays. */
export function jsonLdTypes(html: string): Set<string> {
  const types = new Set<string>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const t of [o["@type"]].flat()) if (typeof t === "string") types.add(t);
    if (o["@graph"]) visit(o["@graph"]);
    if (o.mainEntity) visit(o.mainEntity);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]!));
    } catch {
      // malformed JSON-LD on the page: ignore that block
    }
  }
  return types;
}

const ORG_TYPES = ["Organization", "LocalBusiness", "Corporation", "ProfessionalService", "LegalService", "MedicalBusiness", "Store"];

async function get(url: string) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "Mozilla/5.0 (compatible; AIVisibilityTracker/1.0; site checkup)" } });
    return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : "" };
  } catch {
    return { ok: false, status: 0, text: "" };
  }
}

/** Fetches the homepage, robots.txt and llms.txt of a site and runs the checks (handoff §10). */
export async function checkSite(websiteUrl: string, now = new Date()): Promise<SiteCheckResults> {
  const origin = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`).origin;
  const [home, robots, llms] = await Promise.all([get(origin + "/"), get(`${origin}/robots.txt`), get(`${origin}/llms.txt`)]);
  const types = jsonLdTypes(home.text);
  return {
    checkedAt: now.toISOString(),
    homepageReachable: home.ok,
    blockedBots: robots.ok ? AI_BOTS.filter((b) => robotsBlocksRoot(robots.text, b)) : [],
    // a real llms.txt is markdown, not an HTML 200 from a catch-all route
    hasLlmsTxt: llms.ok && llms.text.trim().length > 0 && !/^\s*<(!doctype|html)/i.test(llms.text),
    hasOrganizationSchema: ORG_TYPES.some((t) => types.has(t)),
    hasFaqSchema: types.has("FAQPage"),
  };
}
