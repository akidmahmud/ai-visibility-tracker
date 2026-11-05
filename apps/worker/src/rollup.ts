import type { PrismaClient } from "@avt/db";

/**
 * Recomputes DailyRollup and DailyCitationRollup for one brand on the given UTC days (YYYY-MM-DD).
 * Idempotent: the days are deleted and rebuilt from Answer/Mention/Citation. Dashboards read only these tables.
 *
 * Per entity × model × day: `answers` = OK answers (the visibility denominator), `noAiResult` = answers where
 * the engine showed no AI answer, `mentions`/`scoreSum`/`rankSum` = recommended mentions only (rank > 0),
 * sentiment counts = every mention whose sentiment was assessed. The brand and its tracked competitors get a row even with 0 mentions.
 */
export async function rollupDays(prisma: PrismaClient, brandId: string, days: string[]) {
  if (!days.length) return;
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "DailyRollup" WHERE "brandId" = ${brandId} AND "day" = ANY(${days}::date[])`,
    prisma.$executeRaw`
      INSERT INTO "DailyRollup" ("brandId", "entityId", "model", "day", "answers", "noAiResult", "mentions", "scoreSum", "rankSum",
                                 "positive", "neutral", "negative", "createdAt", "updatedAt")
      WITH base AS (
        SELECT a."model", a."capturedAt"::date AS day,
               count(*) FILTER (WHERE a."status" = 'OK')::int AS answers,
               count(*) FILTER (WHERE a."status" = 'NO_AI_RESULT')::int AS no_ai
        FROM "Answer" a
        WHERE a."brandId" = ${brandId} AND a."capturedAt"::date = ANY(${days}::date[])
        GROUP BY 1, 2
      ),
      m AS (
        SELECT a."model", a."capturedAt"::date AS day, mn."entityId",
               count(*) FILTER (WHERE mn."rank" > 0)::int AS mentions,
               coalesce(sum(mn."score") FILTER (WHERE mn."rank" > 0), 0)::int AS score_sum,
               coalesce(sum(mn."rank") FILTER (WHERE mn."rank" > 0), 0)::int AS rank_sum,
               -- confidence 0 = sentiment never assessed (no LLM, or a known entity only the matcher found)
               count(*) FILTER (WHERE mn."sentiment" = 'POSITIVE' AND mn."sentimentConfidence" > 0)::int AS positive,
               count(*) FILTER (WHERE mn."sentiment" = 'NEUTRAL' AND mn."sentimentConfidence" > 0)::int AS neutral,
               count(*) FILTER (WHERE mn."sentiment" = 'NEGATIVE' AND mn."sentimentConfidence" > 0)::int AS negative
        FROM "Mention" mn JOIN "Answer" a ON a."id" = mn."answerId"
        WHERE a."brandId" = ${brandId} AND a."status" = 'OK' AND a."capturedAt"::date = ANY(${days}::date[])
        GROUP BY 1, 2, 3
      ),
      tracked AS (
        SELECT "entityId" FROM "Brand" WHERE "id" = ${brandId} AND "entityId" IS NOT NULL
        UNION SELECT "entityId" FROM "Competitor" WHERE "brandId" = ${brandId} AND "deletedAt" IS NULL
      ),
      entities AS (SELECT "entityId" FROM tracked UNION SELECT DISTINCT "entityId" FROM m)
      SELECT ${brandId}, e."entityId", b."model", b.day, b.answers, b.no_ai,
             coalesce(m.mentions, 0), coalesce(m.score_sum, 0), coalesce(m.rank_sum, 0),
             coalesce(m.positive, 0), coalesce(m.neutral, 0), coalesce(m.negative, 0), now(), now()
      FROM base b
      CROSS JOIN entities e
      LEFT JOIN m ON m."model" = b."model" AND m.day = b.day AND m."entityId" = e."entityId"
      WHERE m."entityId" IS NOT NULL OR e."entityId" IN (SELECT "entityId" FROM tracked)`,
    prisma.$executeRaw`DELETE FROM "DailyPromptRollup" WHERE "brandId" = ${brandId} AND "day" = ANY(${days}::date[])`,
    prisma.$executeRaw`
      INSERT INTO "DailyPromptRollup" ("brandId", "promptId", "entityId", "model", "day", "answers", "noAiResult", "mentions",
                                       "scoreSum", "rankSum", "citations", "positive", "neutral", "negative", "createdAt", "updatedAt")
      WITH base AS (
        SELECT a."promptId", a."model", a."capturedAt"::date AS day,
               count(*) FILTER (WHERE a."status" = 'OK')::int AS answers,
               count(*) FILTER (WHERE a."status" = 'NO_AI_RESULT')::int AS no_ai,
               coalesce(sum((SELECT count(*) FROM "Citation" c WHERE c."answerId" = a."id" AND NOT c."searchResult")), 0)::int AS citations
        FROM "Answer" a
        WHERE a."brandId" = ${brandId} AND a."capturedAt"::date = ANY(${days}::date[])
        GROUP BY 1, 2, 3
      ),
      m AS (
        SELECT a."promptId", a."model", a."capturedAt"::date AS day, mn."entityId",
               count(*) FILTER (WHERE mn."rank" > 0)::int AS mentions,
               coalesce(sum(mn."score") FILTER (WHERE mn."rank" > 0), 0)::int AS score_sum,
               coalesce(sum(mn."rank") FILTER (WHERE mn."rank" > 0), 0)::int AS rank_sum,
               count(*) FILTER (WHERE mn."sentiment" = 'POSITIVE' AND mn."sentimentConfidence" > 0)::int AS positive,
               count(*) FILTER (WHERE mn."sentiment" = 'NEUTRAL' AND mn."sentimentConfidence" > 0)::int AS neutral,
               count(*) FILTER (WHERE mn."sentiment" = 'NEGATIVE' AND mn."sentimentConfidence" > 0)::int AS negative
        FROM "Mention" mn JOIN "Answer" a ON a."id" = mn."answerId"
        WHERE a."brandId" = ${brandId} AND a."status" = 'OK' AND a."capturedAt"::date = ANY(${days}::date[])
        GROUP BY 1, 2, 3, 4
      ),
      self AS (SELECT "entityId" FROM "Brand" WHERE "id" = ${brandId} AND "entityId" IS NOT NULL)
      SELECT ${brandId}, b."promptId", e."entityId", b."model", b.day, b.answers, b.no_ai,
             coalesce(m.mentions, 0), coalesce(m.score_sum, 0), coalesce(m.rank_sum, 0), b.citations,
             coalesce(m.positive, 0), coalesce(m.neutral, 0), coalesce(m.negative, 0), now(), now()
      FROM base b
      JOIN (SELECT "entityId", NULL::text AS "promptId", NULL::"ModelTag" AS "model", NULL::date AS day FROM self
            UNION ALL SELECT "entityId", "promptId", "model", day FROM m WHERE "entityId" NOT IN (SELECT "entityId" FROM self)) e
        ON e."promptId" IS NULL OR (e."promptId" = b."promptId" AND e."model" = b."model" AND e.day = b.day)
      LEFT JOIN m ON m."promptId" = b."promptId" AND m."model" = b."model" AND m.day = b.day AND m."entityId" = e."entityId"`,
    prisma.$executeRaw`DELETE FROM "DailyCitationRollup" WHERE "brandId" = ${brandId} AND "day" = ANY(${days}::date[])`,
    prisma.$executeRaw`
      INSERT INTO "DailyCitationRollup" ("brandId", "promptId", "url", "domain", "title", "model", "day", "count", "searchCount", "createdAt", "updatedAt")
      SELECT ${brandId}, a."promptId", c."url", min(c."domain"), max(c."title"), a."model", a."capturedAt"::date, count(*)::int,
             count(*) FILTER (WHERE c."searchResult")::int, now(), now()
      FROM "Citation" c JOIN "Answer" a ON a."id" = c."answerId"
      WHERE a."brandId" = ${brandId} AND a."capturedAt"::date = ANY(${days}::date[])
      GROUP BY a."promptId", c."url", a."model", a."capturedAt"::date`,
  ]);
}

/** UTC calendar days (YYYY-MM-DD) that a set of answers fall on. */
export const daysOf = (dates: Date[]) => [...new Set(dates.map((d) => d.toISOString().slice(0, 10)))];
