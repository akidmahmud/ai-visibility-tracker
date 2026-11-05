/** Jaro-Winkler similarity in [0, 1]. Used for brand-scoped fuzzy entity matching (handoff §9: ≥ 0.93). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  for (let i = 0, j = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[j]) j++;
    if (a[i] !== b[j++]) transpositions++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;

  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}
