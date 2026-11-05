// Entity/domain normalization (handoff §9). Pure functions only.

const LEGAL_SUFFIX =
  /(?:\s+(?:llc|llp|inc|ltd|co|corp|corporation|pc|p\s*c|plc|gmbh|pty|limited|company|group))+$/;

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEGAL_SUFFIX, "")
    .trim();
}

/** "https://WWW.Example.com/path" → "example.com". Returns null for unparseable input. */
export function normalizeDomain(urlOrHost: string): string | null {
  const s = urlOrHost.trim();
  if (!s) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname;
    return host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}
