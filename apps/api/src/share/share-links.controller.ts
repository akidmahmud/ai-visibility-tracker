import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { CreateShareLink, type ShareTab } from "@avt/shared";
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { createHash, randomBytes } from "node:crypto";
import { createZodDto } from "nestjs-zod";
import * as q from "../analytics/queries";
import { type Filters, QueryFilters } from "../analytics/queries";
import { CurrentWorkspace, Public } from "../auth/workspace.guard";
import { ownedBrand } from "../brands/brand-scope";

class CreateShareLinkDto extends createZodDto(CreateShareLink) {}

/** Share links the agency hands to its clients. Tokens are opaque and random (handoff §17.14). */
@Controller("brands/:brandId/share-links")
export class ShareLinksController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async list(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const links = await this.prisma.shareLink.findMany({
      where: { brandId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { opens: true } }, opens: { orderBy: { openedAt: "desc" }, take: 1, select: { openedAt: true } } },
    });
    return links.map(({ _count, opens, ...l }) => ({ ...l, openCount: _count.opens, lastOpenedAt: opens[0]?.openedAt ?? null }));
  }

  @Post()
  async create(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: CreateShareLinkDto) {
    await ownedBrand(this.prisma, ws, brandId);
    return this.prisma.shareLink.create({ data: { brandId, token: randomBytes(24).toString("base64url"), visibleTabs: body.visibleTabs } });
  }

  @Delete(":linkId")
  @HttpCode(204)
  async revoke(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Param("linkId", ParseUUIDPipe) linkId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const { count } = await this.prisma.shareLink.updateMany({ where: { id: linkId, brandId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException();
  }
}

/** Read-only report behind a share token. No sign-in; only the tabs the link allows. */
@Public()
@Controller("public/share/:token")
export class PublicShareController {
  constructor(private readonly prisma: PrismaClient) {}

  private async link(token: string, tab?: ShareTab) {
    const link = await this.prisma.shareLink.findUnique({
      where: { token },
      include: { brand: { include: { workspace: { select: { name: true, whiteLabel: true, customDomain: true } } } } },
    });
    // same answer for unknown, revoked and deleted, so tokens can't be probed
    if (!link || link.revokedAt || link.brand.deletedAt) throw new NotFoundException();
    if (tab && !link.visibleTabs.includes(tab)) throw new ForbiddenException("This report does not include that page");
    return link;
  }

  /** Report header; also records the open (IP is stored only as a salted hash). */
  @Get()
  async open(@Param("token") token: string, @Req() req: Request) {
    const link = await this.link(token);
    const salt = process.env.BETTER_AUTH_SECRET ?? "";
    await this.prisma.shareOpen.create({
      data: {
        shareLinkId: link.id,
        ipHash: createHash("sha256").update(`${salt}:${req.ip ?? ""}`).digest("hex"),
        ua: (req.headers["user-agent"] ?? "").slice(0, 300),
      },
    });
    return {
      brand: { name: link.brand.name, domain: link.brand.domain },
      agency: { name: link.brand.workspace.name, whiteLabel: link.brand.workspace.whiteLabel, customDomain: link.brand.workspace.customDomain },
      visibleTabs: link.visibleTabs,
    };
  }

  @Get("dashboard")
  async dashboard(@Param("token") token: string, @QueryFilters() f: Filters) {
    const { brand } = await this.link(token, "dashboard");
    const [summary, timeseries, sources] = await Promise.all([q.summary(this.prisma, brand, f), q.timeseries(this.prisma, brand, f), q.sources(this.prisma, brand, f)]);
    return { summary, timeseries, topSources: sources.domains.slice(0, 10) };
  }

  @Get("prompts")
  async prompts(@Param("token") token: string, @QueryFilters() f: Filters) {
    const { brand } = await this.link(token, "prompts");
    return q.prompts(this.prisma, brand, f);
  }

  @Get("competitors")
  async competitors(@Param("token") token: string, @QueryFilters() f: Filters) {
    const { brand } = await this.link(token, "competitors");
    const [summary, heatmap] = await Promise.all([q.summary(this.prisma, brand, f), q.heatmap(this.prisma, brand, f)]);
    return { summary, heatmap };
  }

  @Get("sources")
  async sources(@Param("token") token: string, @QueryFilters() f: Filters, @Query("view") view?: string) {
    const { brand } = await this.link(token, "sources");
    return q.sources(this.prisma, brand, f, view === "urls" ? "urls" : "domains");
  }
}
