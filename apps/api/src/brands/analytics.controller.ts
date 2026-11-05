import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import * as q from "../analytics/queries";
import { type Filters, QueryFilters } from "../analytics/queries";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { ownedBrand } from "./brand-scope";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Dashboard data for one brand. Every route takes ?days, ?models, ?topics and ?intents (comma-separated). */
@Controller("brands/:brandId")
export class AnalyticsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get("summary")
  async summary(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) id: string, @QueryFilters() f: Filters) {
    return q.summary(this.prisma, await ownedBrand(this.prisma, ws, id), f);
  }

  @Get("timeseries")
  async timeseries(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) id: string, @QueryFilters() f: Filters) {
    return q.timeseries(this.prisma, await ownedBrand(this.prisma, ws, id), f);
  }

  @Get("competitors/heatmap")
  async heatmap(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) id: string, @QueryFilters() f: Filters) {
    return q.heatmap(this.prisma, await ownedBrand(this.prisma, ws, id), f);
  }

  @Get("prompt-metrics")
  async promptMetrics(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) id: string, @QueryFilters() f: Filters) {
    return q.prompts(this.prisma, await ownedBrand(this.prisma, ws, id), f);
  }

  /** ?view=urls lists individual pages instead of sites; ?format=csv downloads the table. */
  @Get("sources")
  async sources(
    @CurrentWorkspace() ws: Workspace,
    @Param("brandId", ParseUUIDPipe) id: string,
    @QueryFilters() f: Filters,
    @Res({ passthrough: true }) res: Response,
    @Query("view") view?: string,
    @Query("format") format?: string,
    @Query("prompt", new ParseUUIDPipe({ optional: true })) promptId?: string,
  ) {
    const brand = await ownedBrand(this.prisma, ws, id);
    const data = await q.sources(this.prisma, brand, f, view === "urls" ? "urls" : "domains", promptId);
    if (format !== "csv") return data;
    const models = [...new Set(data.domains.flatMap((x) => Object.keys(x.byModel)))].sort();
    const head = data.view === "urls" ? ["url", "title", "domain"] : ["domain"];
    const lines = [
      [...head, "citations", "google_results", "answers", "share", "owner", "site_type", ...(data.view === "urls" ? ["page_type"] : []), "last_seen", ...models],
      ...data.domains.map((x) => [
        ...(data.view === "urls" ? [x.url, x.title, x.domain] : [x.domain]),
        x.count,
        x.searchCount,
        x.answers,
        x.share?.toFixed(4),
        x.owner,
        x.siteType,
        ...(data.view === "urls" ? [x.pageType] : []),
        x.lastSeen,
        ...models.map((mm) => x.byModel[mm] ?? 0),
      ]),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${brand.domain}-sources${data.view === "urls" ? "-pages" : ""}.csv"`);
    return lines.map((l) => l.map(csvCell).join(",")).join("\n");
  }

  /** Every answer that cited one URL (the Sources "View" panel). */
  @Get("sources/url")
  async sourceUrl(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) id: string, @QueryFilters() f: Filters, @Query("url") url?: string) {
    if (!url) throw new BadRequestException("url is required");
    const brand = await ownedBrand(this.prisma, ws, id);
    return q.sourceDetail(this.prisma, brand, f, url);
  }

  @Get("answers")
  async answers(
    @CurrentWorkspace() ws: Workspace,
    @Param("brandId", ParseUUIDPipe) id: string,
    @QueryFilters() f: Filters,
    @Query("prompt") promptId?: string,
    @Query("mentioned") mentioned?: string,
    @Query("page") page?: string,
  ) {
    return q.answers(this.prisma, await ownedBrand(this.prisma, ws, id), f, {
      promptId: promptId || undefined,
      mentioned: mentioned === "yes" || mentioned === "no" ? mentioned : undefined,
      page: Math.max(1, Number(page) || 1),
    });
  }

  @Get("answers/:answerId")
  async answer(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) id: string, @Param("answerId", ParseUUIDPipe) answerId: string) {
    const detail = await q.answerDetail(this.prisma, await ownedBrand(this.prisma, ws, id), answerId);
    if (!detail) throw new NotFoundException();
    return detail;
  }
}
