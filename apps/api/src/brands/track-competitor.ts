import type { PrismaClient } from "@avt/db";
import { normalizeDomain, normalizeName } from "@avt/shared";

/** Resolves a name/site to a canonical Entity (handoff §9: domain first, then exact alias) and tracks it for the brand. */
export async function trackCompetitor(prisma: PrismaClient, brandId: string, name: string, websiteUrl?: string | null) {
  const domain = websiteUrl ? normalizeDomain(websiteUrl) : null;
  const normalized = normalizeName(name);

  const entity =
    (domain && (await prisma.entity.findUnique({ where: { domain } }))) ||
    (await prisma.entityAlias.findUnique({ where: { normalized }, include: { entity: true } }))?.entity ||
    (await prisma.entity.create({ data: { canonicalName: name, domain } }));
  await prisma.entityAlias.upsert({ where: { normalized }, update: {}, create: { normalized, raw: name, entityId: entity.id } });
  if (domain && !entity.domain) await prisma.entity.update({ where: { id: entity.id }, data: { domain } }).catch(() => {});

  return prisma.competitor.upsert({
    where: { brandId_entityId: { brandId, entityId: entity.id } },
    update: { deletedAt: null, isTracked: true },
    create: { brandId, entityId: entity.id, isTracked: true },
  });
}
