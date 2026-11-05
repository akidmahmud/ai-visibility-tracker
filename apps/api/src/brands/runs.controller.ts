import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { Controller, Get, HttpCode, HttpException, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { Jobs } from "../jobs";
import { ownedBrand } from "./brand-scope";

const DAY = 24 * 3600 * 1000;

@Controller("brands/:brandId")
export class RunsController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jobs: Jobs,
  ) {}

  /** Manual run, allowed once per 24h per brand (handoff §5). */
  @Post("run-now")
  @HttpCode(202)
  async runNow(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    const brand = await ownedBrand(this.prisma, ws, brandId);
    const now = new Date();
    // one conditional update: two clicks at once can't both pass the 24h check
    const { count } = await this.prisma.brand.updateMany({
      where: { id: brand.id, OR: [{ lastManualRunAt: null }, { lastManualRunAt: { lte: new Date(now.getTime() - DAY) } }] },
      data: { lastManualRunAt: now },
    });
    if (!count) throw new HttpException("This brand was already run manually in the last 24 hours.", HttpStatus.TOO_MANY_REQUESTS);
    await this.jobs.startRun(brand.id);
    return { queued: true };
  }

  @Get("runs")
  async list(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const runs = await this.prisma.run.findMany({ where: { brandId }, orderBy: { createdAt: "desc" }, take: 20 });
    const credits = await this.prisma.answer.groupBy({
      by: ["runId"],
      where: { runId: { in: runs.map((r) => r.id) } },
      _sum: { costCredits: true },
      _count: true,
    });
    const byRun = new Map(credits.map((c) => [c.runId, c]));
    return runs.map((r) => ({ ...r, credits: Number(byRun.get(r.id)?._sum.costCredits ?? 0), answersSoFar: byRun.get(r.id)?._count ?? 0 }));
  }
}
