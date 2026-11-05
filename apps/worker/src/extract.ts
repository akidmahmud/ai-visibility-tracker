import type { PrismaClient } from "@avt/db";
import { extractMentions, type KnownEntity, type LlmExtractor } from "@avt/extraction";
import { normalizeDomain, normalizeName, score } from "@avt/shared";
import { type BrandScope, ensureBrandEntity, resolveEntity } from "./entities";

/** Writes the Mention rows for one answer and marks it extracted. Safe to re-run: it replaces earlier mentions. */
export async function extractAnswer(prisma: PrismaClient, llm: LlmExtractor | null, answerId: string) {
  const answer = await prisma.answer.findUniqueOrThrow({
    where: { id: answerId },
    include: {
      citations: { where: { searchResult: false }, orderBy: { position: "asc" } },
      brand: {
        include: {
          entity: { include: { aliases: true } },
          competitors: { where: { deletedAt: null }, include: { entity: { include: { aliases: true } } } },
        },
      },
    },
  });
  if (answer.status !== "OK" || !answer.text) {
    await prisma.answer.update({ where: { id: answerId }, data: { extractedAt: new Date() } });
    return [];
  }

  const brand = answer.brand;
  const selfId = await ensureBrandEntity(prisma, brand);
  const selfAliases = brand.entity?.aliases.map((a) => a.raw) ?? [];
  const known: KnownEntity[] = [
    { key: selfId, name: brand.name, aliases: [...new Set([...brand.aliases, ...selfAliases])], domain: brand.domain },
    ...brand.competitors.map((c) => ({
      key: c.entityId,
      name: c.entity.canonicalName,
      aliases: c.entity.aliases.map((a) => a.raw),
      domain: c.entity.domain,
    })),
  ];
  const scope: BrandScope = known.map((k) => ({ entityId: k.key, normalized: [k.name, ...k.aliases].map(normalizeName).filter(Boolean) }));
  const competitorIds = new Set(brand.competitors.map((c) => c.entityId));

  const extracted = await extractMentions({ text: answer.text, known, citations: answer.citations }, llm);

  // resolve to canonical entities; two names can land on one entity, so keep its first appearance
  const byEntity = new Map<string, (typeof extracted)[number]>();
  for (const m of extracted) {
    const entityId = m.knownKey ?? (await resolveEntity(prisma, m.name, m.domain ? normalizeDomain(m.domain) : null, scope));
    if (entityId && !byEntity.has(entityId)) byEntity.set(entityId, m);
  }
  const rows = [...byEntity.entries()];
  const recommended = rows.filter(([, m]) => m.isRecommendation);
  const rankOf = new Map(recommended.map(([id], i) => [id, i + 1]));

  const data = rows.map(([entityId, m]) => {
    const rank = rankOf.get(entityId) ?? 0;
    return {
      answerId,
      brandId: brand.id,
      entityId,
      kind: entityId === selfId ? ("SELF" as const) : competitorIds.has(entityId) ? ("COMPETITOR" as const) : ("UNTRACKED" as const),
      rank,
      totalInAnswer: recommended.length,
      score: rank ? score(rank, recommended.length) : 0,
      sentiment: m.sentiment,
      sentimentConfidence: m.sentimentConfidence,
      summary: m.summary,
    };
  });

  await prisma.$transaction([
    prisma.mention.deleteMany({ where: { answerId } }),
    prisma.mention.createMany({ data }),
    prisma.answer.update({ where: { id: answerId }, data: { extractedAt: new Date() } }),
  ]);
  return data;
}
