import type { Citation } from "./types";

const TRACKING = /^(utm_\w+|gclid|gbraid|wbraid|fbclid|msclkid|mc_cid|mc_eid|srsltid|_hsenc|_hsmi|ref_src)$/i;

/** Drops tracking params and #:~:text= highlight fragments so the same page counts once. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    if (u.hash.startsWith("#:~:")) u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

/** Cleans, de-duplicates and renumbers sources in the order the engine listed them. */
export function toCitations(sources: { url?: string; title?: string }[] = []): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const s of sources) {
    if (!s.url) continue;
    const url = cleanUrl(s.url);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: s.title || undefined, position: out.length + 1 });
  }
  return out;
}
