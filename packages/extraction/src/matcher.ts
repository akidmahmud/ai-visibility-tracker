import type { KnownEntity } from "./schema";

export type KnownMatch = { key: string; name: string; index: number; matched: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Smith & Sons" also matches "Smith and Sons"; any run of spaces/hyphens matches any other. */
function aliasPattern(alias: string): string {
  return alias
    .trim()
    .split(/\s*(?:&|\band\b)\s*/i)
    .map((part) => part.split(/[\s-]+/).filter(Boolean).map(escape).join("[\\s-]+"))
    .join("\\s*(?:&|and)\\s*");
}

/**
 * Step 1 of extraction (free): every known entity named in the text, with the position of its first
 * mention. Case-insensitive, whole words only, so "Acme" does not match "Acmeville" but does match "Acme's".
 */
export function findKnownMentions(text: string, entities: KnownEntity[]): KnownMatch[] {
  const out: KnownMatch[] = [];
  for (const e of entities) {
    const aliases = [e.name, ...e.aliases, ...(e.domain ? [e.domain] : [])].filter((a) => a.trim().length >= 3);
    if (!aliases.length) continue;
    // longest first so "Clifford Law Offices" wins over "Clifford Law" at the same spot
    const alt = [...new Set(aliases)].sort((a, b) => b.length - a.length).map(aliasPattern).join("|");
    const m = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, "iu").exec(text);
    if (m) out.push({ key: e.key, name: e.name, index: m.index, matched: m[0] });
  }
  return out.sort((a, b) => a.index - b.index);
}
