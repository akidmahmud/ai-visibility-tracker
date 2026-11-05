import { Prisma, type PrismaClient } from "@avt/db";
import { jaroWinkler, normalizeName } from "@avt/shared";

const FUZZY = 0.93;

/** The known entities of one brand (itself + competitors) with their normalized aliases, for fuzzy matching. */
export type BrandScope = { entityId: string; normalized: string[] }[];

export async function addAlias(prisma: PrismaClient, entityId: string, raw: string) {
  const normalized = normalizeName(raw);
  if (normalized) await prisma.entityAlias.createMany({ data: [{ entityId, normalized, raw }], skipDuplicates: true });
}

/**
 * Raw name → canonical Entity (handoff §9): exact alias, then domain, then Jaro-Winkler ≥ 0.93 against
 * this brand's own known entities only (never globally: "Apple" must not merge into "Apple Hospitality"),
 * else a new Entity.
 */
export async function resolveEntity(prisma: PrismaClient, name: string, domain: string | null, scope: BrandScope): Promise<string | null> {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const alias = await prisma.entityAlias.findUnique({ where: { normalized } });
  if (alias) return alias.entityId;

  if (domain) {
    const byDomain = await prisma.entity.findUnique({ where: { domain } });
    if (byDomain) {
      await addAlias(prisma, byDomain.id, name);
      return byDomain.id;
    }
  }

  const fuzzy = scope.find((e) => e.normalized.some((n) => jaroWinkler(n, normalized) >= FUZZY));
  if (fuzzy) {
    await addAlias(prisma, fuzzy.entityId, name);
    return fuzzy.entityId;
  }

  try {
    const created = await prisma.entity.create({
      data: { canonicalName: name, domain, aliases: { create: { normalized, raw: name } } },
    });
    return created.id;
  } catch (e) {
    // another job created it a moment ago (alias or domain unique): use theirs
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = (await prisma.entityAlias.findUnique({ where: { normalized } })) ?? null;
      if (again) return again.entityId;
      if (domain) return (await prisma.entity.findUniqueOrThrow({ where: { domain } })).id;
    }
    throw e;
  }
}

/** Links a brand to its own Entity (creating it if needed) so mentions of it are classified SELF. */
export async function ensureBrandEntity(
  prisma: PrismaClient,
  brand: { id: string; name: string; domain: string; aliases: string[]; entityId: string | null },
): Promise<string> {
  if (brand.entityId) return brand.entityId;
  const existing =
    (await prisma.entity.findUnique({ where: { domain: brand.domain } })) ??
    (await prisma.entityAlias.findUnique({ where: { normalized: normalizeName(brand.name) }, include: { entity: true } }))?.entity;
  const entityId = existing?.id ?? (await prisma.entity.create({ data: { canonicalName: brand.name, domain: brand.domain } })).id;
  if (existing && !existing.domain) await prisma.entity.update({ where: { id: entityId }, data: { domain: brand.domain } }).catch(() => {});
  for (const raw of [brand.name, ...brand.aliases]) await addAlias(prisma, entityId, raw);
  await prisma.brand.update({ where: { id: brand.id }, data: { entityId } });
  return entityId;
}
