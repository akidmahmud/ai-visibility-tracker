import type { PrismaClient } from "@avt/db";
import { classifySites, type modelFromEnv, SITE_BATCH } from "@avt/extraction";
import { knownSiteType } from "@avt/shared";

type LanguageModel = NonNullable<ReturnType<typeof modelFromEnv>>;

// Free LLM tiers allow ~50 calls a day; classification takes at most this many of them.
const DAILY_LLM_CALLS = Number(process.env.SITE_CLASSIFY_DAILY_CALLS ?? 5);
let pausedUntil = 0;

/**
 * Gives every cited domain a site type once: the fixed list first (free), then the LLM in batches of 40.
 * Without an LLM, unlisted domains stay unclassified and show as "Other".
 */
export async function classifyNewSites(prisma: PrismaClient, model: LanguageModel | null, now = new Date()) {
  const unclassified = await prisma.$queryRaw<{ domain: string; title: string | null }[]>`
    SELECT c."domain", max(c."title") AS title
    FROM "Citation" c LEFT JOIN "SiteClassification" s ON s."domain" = c."domain"
    WHERE s."domain" IS NULL
    GROUP BY c."domain"
    ORDER BY count(*) DESC
    LIMIT 2000`;
  if (!unclassified.length) return 0;

  const listed = unclassified.flatMap((u) => {
    const t = knownSiteType(u.domain);
    return t ? [{ domain: u.domain, siteType: t, source: "list" }] : [];
  });
  if (listed.length) await prisma.siteClassification.createMany({ data: listed, skipDuplicates: true });

  const rest = unclassified.filter((u) => !knownSiteType(u.domain));
  if (!model || !rest.length || Date.now() < pausedUntil) return listed.length;

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const doneToday = await prisma.siteClassification.count({ where: { source: "llm", createdAt: { gte: today } } });
  const callsLeft = DAILY_LLM_CALLS - Math.ceil(doneToday / SITE_BATCH);
  let classified = listed.length;
  for (let i = 0; i < callsLeft && i * SITE_BATCH < rest.length; i++) {
    const batch = rest.slice(i * SITE_BATCH, (i + 1) * SITE_BATCH);
    const types = await classifySites(model, batch).catch((e) => {
      pausedUntil = Date.now() + 3600_000; // quota or outage: try again in an hour, not every tick
      throw e;
    });
    await prisma.siteClassification.createMany({
      data: [...types].map(([domain, siteType]) => ({ domain, siteType, source: "llm" })),
      skipDuplicates: true,
    });
    classified += types.size;
  }
  return classified;
}
