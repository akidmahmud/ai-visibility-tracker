import type { PrismaClient, Workspace } from "@avt/db";
import { NotFoundException } from "@nestjs/common";

/** Every brand-scoped route goes through this: the brand must belong to the caller's workspace. */
export async function ownedBrand(prisma: PrismaClient, ws: Workspace, brandId: string) {
  const brand = await prisma.brand.findFirst({ where: { id: brandId, workspaceId: ws.id, deletedAt: null } });
  if (!brand) throw new NotFoundException();
  return brand;
}
