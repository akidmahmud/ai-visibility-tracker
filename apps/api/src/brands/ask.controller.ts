import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { modelFromEnv } from "@avt/extraction";
import { askData } from "@avt/insights";
import { Body, Controller, Param, ParseUUIDPipe, Post, ServiceUnavailableException } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import * as q from "../analytics/queries";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { ownedBrand } from "./brand-scope";

class AskDto extends createZodDto(
  z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(2000) })).min(1).max(20) }),
) {}

/** "Ask AI" (beta): questions about one brand's last 30 days, answered by the configured LLM from a compact data summary. */
@Controller("brands/:brandId/ask")
export class AskController {
  private readonly model = modelFromEnv();
  constructor(private readonly prisma: PrismaClient) {}

  @Post()
  async ask(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: AskDto) {
    if (!this.model) throw new ServiceUnavailableException("No AI model is configured (EXTRACTION_MODEL).");
    const brand = await ownedBrand(this.prisma, ws, brandId);
    const f = { days: 30, models: [], topics: [], intents: [] };
    const [summary, prompts, sources, todos] = await Promise.all([
      q.summary(this.prisma, brand, f),
      q.prompts(this.prisma, brand, f),
      q.sources(this.prisma, brand, f),
      this.prisma.todo.findMany({ where: { brandId, status: { in: ["SUGGESTED", "TODO"] } }, select: { title: true, priority: true }, take: 15 }),
    ]);
    const r = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);
    const facts = {
      period: "last 30 days",
      brand: summary.brand && { visibility: r(summary.brand.visibility), avgPosition: r(summary.brand.avgPosition), answers: summary.brand.answers, trend: summary.brand.trend },
      companies: summary.entities.slice(0, 15).map((e) => ({ name: e.name, kind: e.kind, visibility: r(e.visibility), avgPosition: r(e.avgPosition), mentions: e.mentions })),
      prompts: prompts.prompts.slice(0, 40).map((p) => ({ text: p.text, intent: p.intent, visibility: r(p.visibility), avgPosition: r(p.avgPosition), answers: p.answers })),
      topDomains: sources.domains.slice(0, 15).map((d) => ({ domain: d.domain, citations: d.count, type: d.siteType, owner: d.owner })),
      openTodos: todos,
    };
    try {
      return { answer: await askData(this.model, brand.name, facts, body.messages) };
    } catch (e) {
      throw new ServiceUnavailableException(`The AI model didn't answer: ${(e as Error).message.slice(0, 200)}`);
    }
  }
}
