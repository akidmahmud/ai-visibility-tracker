/** Site categories for cited domains (modelled on Peekaboo's source taxonomy). */
export const SITE_CATEGORIES = [
  "Marketing Agencies",
  "Software & Tools",
  "Reviews & Directories",
  "News & Media",
  "Social Media",
  "Forums & Communities",
  "Video",
  "Reference & Wiki",
  "Local Services",
  "Professional Services",
  "E-commerce & Marketplaces",
  "Government & Education",
  "Blogs & Personal",
  "Other",
] as const;
export type SiteCategory = (typeof SITE_CATEGORIES)[number];

// Big, frequently cited sites known up front. Every other domain is classified once by the extraction LLM
// (worker sweep) and stored in SiteClassification; until then it shows as "Other".
const KNOWN: Partial<Record<SiteCategory, string[]>> = {
  "Forums & Communities": ["reddit.com", "quora.com", "stackexchange.com", "stackoverflow.com"],
  Video: ["youtube.com", "youtu.be", "vimeo.com", "tiktok.com"],
  "Social Media": ["linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "medium.com", "pinterest.com", "threads.net"],
  "Reviews & Directories": [
    "yelp.com", "trustpilot.com", "g2.com", "capterra.com", "clutch.co", "bbb.org", "angi.com", "thumbtack.com",
    "tripadvisor.com", "upcity.com", "designrush.com", "goodfirms.co", "sortlist.com", "expertise.com", "avvo.com",
    "justia.com", "superlawyers.com", "martindale.com", "lawyers.com", "findlaw.com", "healthgrades.com", "zocdoc.com",
    "google.com", "maps.apple.com", "bing.com", "yellowpages.com", "manta.com", "agencies.semrush.com",
  ],
  "Reference & Wiki": ["wikipedia.org", "wikihow.com", "fandom.com"],
  "News & Media": [
    "nytimes.com", "wsj.com", "forbes.com", "bloomberg.com", "reuters.com", "apnews.com", "cnn.com", "bbc.com", "bbc.co.uk",
    "theguardian.com", "businessinsider.com", "techcrunch.com", "cnbc.com", "usatoday.com", "axios.com", "inc.com",
  ],
  "E-commerce & Marketplaces": ["amazon.com", "ebay.com", "etsy.com", "walmart.com", "bestbuy.com", "target.com"],
};

const BY_DOMAIN = new Map(Object.entries(KNOWN).flatMap(([type, domains]) => (domains ?? []).map((d) => [d, type] as const)));

/** Category from the fixed list for a normalized domain (subdomains inherit), or null if not listed. */
export function knownSiteType(domain: string): SiteCategory | null {
  const parts = domain.toLowerCase().split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const hit = BY_DOMAIN.get(parts.slice(i).join("."));
    if (hit) return hit as SiteCategory;
  }
  return null;
}

/** Category from the fixed list, "Other" when unlisted (callers prefer the stored LLM classification). */
export const siteType = (domain: string): SiteCategory => knownSiteType(domain) ?? "Other";

/** What kind of page a cited URL is. */
export const PAGE_TYPES = ["Home Page", "Listicle", "Guide", "Blog Post", "Directory", "Reference", "Review", "Forum Thread", "Video", "Product Page", "Article"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/**
 * Page type from the URL and title alone.
 * ponytail: keyword rules, no fetch or LLM; misses read as "Article". Upgrade path: classify titles with the
 * extraction model in the worker's site sweep and store per URL.
 */
export function pageType(url: string, title?: string | null, domain?: string): PageType {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Article";
  }
  const host = (domain ?? u.hostname).replace(/^www\./, "");
  const path = u.pathname.toLowerCase().replace(/\/+$/, "");
  const t = (title ?? "").toLowerCase();
  const kind = siteType(host);
  if (kind === "Video") return "Video";
  if (kind === "Forums & Communities") return "Forum Thread";
  if (path === "" || /^\/(index\.(html?|php))?$/.test(path)) return "Home Page";
  if (/\b(best|top \d+|\d+ (best|top))\b/.test(t) || /\/(best|top)-/.test(path)) return "Listicle";
  if (/\b(reviews?|vs\.?|versus|compared?)\b/.test(t) || /\/reviews?\b/.test(path)) return "Review";
  if (/\b(how to|guide|what is|explained|tutorial|faq)\b/.test(t) || /\/(guides?|learn|how-to|faq)\b/.test(path)) return "Guide";
  if (/\.(gov|edu)(\.[a-z]{2})?$/.test(host) || kind === "Reference & Wiki" || /\/(statutes?|laws?|regulations?|legal-forms|wiki)\b/.test(path)) return "Reference";
  if (kind === "Reviews & Directories" || /\b(find|directory|near me|list of)\b/.test(t) || /\/(directory|find|listings?|attorneys|lawyers|agencies|providers)\b/.test(path)) return "Directory";
  if (/\/(blog|news|posts?|articles?|insights|\d{4}\/\d{2})\b/.test(path)) return "Blog Post";
  if (/[/-](services?|products?|pricing|solutions?|practice-areas?)(\/|$)/.test(path)) return "Product Page";
  return "Article";
}
