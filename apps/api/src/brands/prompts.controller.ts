import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { CreatePrompts, UpdatePrompt } from "@avt/shared";
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { ownedBrand } from "./brand-scope";

class CreatePromptsDto extends createZodDto(CreatePrompts) {}
class UpdatePromptDto extends createZodDto(UpdatePrompt) {}

// handoff §17.7: cap prompts per brand so nobody adds 5,000 by accident
const MAX_PROMPTS_PER_BRAND = Number(process.env.MAX_PROMPTS_PER_BRAND ?? 200);

@Controller("brands/:brandId/prompts")
export class PromptsController {
  constructor(private readonly prisma: PrismaClient) {}

  /** A topic id from the request must belong to this brand. */
  private async assertTopic(brandId: string, topicId: string | null | undefined) {
    if (topicId && !(await this.prisma.topic.findFirst({ where: { id: topicId, brandId } }))) throw new BadRequestException("Unknown topic");
  }

  @Get()
  async list(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    return this.prisma.prompt.findMany({ where: { brandId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  }

  /** Adds one or many prompts; duplicates of existing prompts are skipped. */
  @Post()
  async create(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: CreatePromptsDto) {
    await ownedBrand(this.prisma, ws, brandId);
    await this.assertTopic(brandId, body.topicId);
    const existing = await this.prisma.prompt.findMany({ where: { brandId, deletedAt: null }, select: { text: true } });
    const seen = new Set(existing.map((p) => p.text.toLowerCase()));
    const texts = body.texts.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
    if (existing.length + texts.length > MAX_PROMPTS_PER_BRAND) {
      throw new BadRequestException(`A brand can track at most ${MAX_PROMPTS_PER_BRAND} prompts.`);
    }
    const { count } = await this.prisma.prompt.createMany({
      data: texts.map((text) => ({ brandId, text, intent: body.intent, topicId: body.topicId, location: body.location, source: body.source })),
    });
    return { created: count, skipped: body.texts.length - count };
  }

  @Patch(":promptId")
  async update(
    @CurrentWorkspace() ws: Workspace,
    @Param("brandId", ParseUUIDPipe) brandId: string,
    @Param("promptId", ParseUUIDPipe) promptId: string,
    @Body() body: UpdatePromptDto,
  ) {
    await ownedBrand(this.prisma, ws, brandId);
    await this.assertTopic(brandId, body.topicId);
    const { count } = await this.prisma.prompt.updateMany({ where: { id: promptId, brandId, deletedAt: null }, data: body });
    if (!count) throw new NotFoundException();
    return this.prisma.prompt.findUniqueOrThrow({ where: { id: promptId } });
  }

  @Delete(":promptId")
  @HttpCode(204)
  async remove(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Param("promptId", ParseUUIDPipe) promptId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const { count } = await this.prisma.prompt.updateMany({
      where: { id: promptId, brandId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    if (!count) throw new NotFoundException();
  }
}
