import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { CreateCompetitor } from "@avt/shared";
import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { ownedBrand } from "./brand-scope";
import { trackCompetitor } from "./track-competitor";

class CreateCompetitorDto extends createZodDto(CreateCompetitor) {}

@Controller("brands/:brandId/competitors")
export class CompetitorsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async list(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    return this.prisma.competitor.findMany({
      where: { brandId, deletedAt: null },
      include: { entity: { select: { canonicalName: true, domain: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  @Post()
  async create(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: CreateCompetitorDto) {
    await ownedBrand(this.prisma, ws, brandId);
    return trackCompetitor(this.prisma, brandId, body.name, body.websiteUrl);
  }

  @Delete(":competitorId")
  @HttpCode(204)
  async remove(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Param("competitorId", ParseUUIDPipe) id: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const { count } = await this.prisma.competitor.updateMany({ where: { id, brandId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!count) throw new NotFoundException();
  }
}
