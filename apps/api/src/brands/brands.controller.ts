import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { CreateBrand, nextRunAt, normalizeDomain, UpdateBrand } from "@avt/shared";
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { CurrentWorkspace } from "../auth/workspace.guard";

class CreateBrandDto extends createZodDto(CreateBrand) {}
class UpdateBrandDto extends createZodDto(UpdateBrand) {}

function domainOf(websiteUrl: string) {
  const domain = normalizeDomain(websiteUrl);
  if (!domain) throw new BadRequestException("websiteUrl is not a valid URL");
  return domain;
}

@Controller("brands")
export class BrandsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  list(@CurrentWorkspace() ws: Workspace) {
    return this.prisma.brand.findMany({ where: { workspaceId: ws.id, deletedAt: null }, orderBy: { name: "asc" } });
  }

  @Get(":id")
  async get(@CurrentWorkspace() ws: Workspace, @Param("id", ParseUUIDPipe) id: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, workspaceId: ws.id, deletedAt: null } });
    if (!brand) throw new NotFoundException();
    return brand;
  }

  @Post()
  create(@CurrentWorkspace() ws: Workspace, @Body() body: CreateBrandDto) {
    return this.prisma.brand.create({
      data: { ...body, domain: domainOf(body.websiteUrl), workspaceId: ws.id, nextRunAt: nextRunAt(body.frequency, new Date()) },
    });
  }

  @Patch(":id")
  async update(@CurrentWorkspace() ws: Workspace, @Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateBrandDto) {
    const data = body.websiteUrl ? { ...body, domain: domainOf(body.websiteUrl) } : body;
    const { count } = await this.prisma.brand.updateMany({ where: { id, workspaceId: ws.id, deletedAt: null }, data });
    if (!count) throw new NotFoundException();
    return this.get(ws, id);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentWorkspace() ws: Workspace, @Param("id", ParseUUIDPipe) id: string) {
    const { count } = await this.prisma.brand.updateMany({
      where: { id, workspaceId: ws.id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (!count) throw new NotFoundException();
  }
}
