import { createPrisma, type PrismaClient } from "@avt/db";
import { parseCloro } from "@avt/providers";
import { normalizeDomain, siteType } from "@avt/shared";
import { RawStore } from "./raw-store";
import { daysOf, rollupDays } from "./rollup";

/**
 * Adds Google's blue links to AI Overview answers captured before they were stored, by re-parsing the saved
 * Cloro payloads. No provider calls. Idempotent: answers that already have search results are skipped.
 */
export async function backfillSearchResults(prisma: PrismaClient, store: RawStore) {
  const answers = await prisma.answer.findMany({
    where: { model: "google_aio", provider: "cloro", rawKey: { not: null }, citations: { none: { searchResult: true } } },
    select: { id: true, brandId: true, rawKey: true, capturedAt: true, citations: { select: { url: true } } },
  });
  const touched = new Map<string, Date[]>();
  let added = 0;
  for (const a of answers) {
    let raw: unknown;
    try {
      raw = await store.get(a.rawKey!);
    } catch {
      continue; // payload missing (e.g. a test row): nothing to re-parse
    }
    const have = new Set(a.citations.map((c) => c.url));
    const search = parseCloro("google_aio", raw as never).citations.filter((c) => c.searchResult && !have.has(c.url));
    if (!search.length) continue;
    const brand = await prisma.brand.findUniqueOrThrow({
      where: { id: a.brandId },
      select: { domain: true, competitors: { where: { deletedAt: null }, select: { entity: { select: { domain: true } } } } },
    });
    const rivals = new Set(brand.competitors.map((c) => c.entity.domain).filter(Boolean));
    const start = a.citations.length;
    await prisma.citation.createMany({
      data: search.map((c, i) => {
        const domain = normalizeDomain(c.url) ?? c.url;
        return {
          answerId: a.id,
          brandId: a.brandId,
          url: c.url,
          domain,
          title: c.title,
          position: start + i + 1,
          ownerType: domain === brand.domain ? "SELF" : rivals.has(domain) ? "COMPETITOR" : "THIRD_PARTY",
          siteType: siteType(domain),
          searchResult: true,
        };
      }),
    });
    added += search.length;
    touched.set(a.brandId, [...(touched.get(a.brandId) ?? []), a.capturedAt]);
  }
  for (const [brandId, dates] of touched) await rollupDays(prisma, brandId, daysOf(dates));
  return { answers: answers.length, added, brands: touched.size };
}

if (require.main === module) {
  const prisma = createPrisma();
  backfillSearchResults(prisma, new RawStore())
    .then((r) => console.log(`Checked ${r.answers} AI Overview answers: added ${r.added} Google search results across ${r.brands} brand(s).`))
    .finally(() => prisma.$disconnect());
}
