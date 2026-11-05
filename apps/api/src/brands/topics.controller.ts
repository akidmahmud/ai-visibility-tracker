import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { CreateTopic } from "@avt/shared";
import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { ownedBrand } from "./brand-scope";

class CreateTopicDto extends createZodDto(CreateTopic) {}

/** Topics group a brand's prompts (e.g. "Pricing", "Phoenix") for filtering. */
@Controller("brands/:brandId/topics")
export class TopicsController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async list(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const topics = await this.prisma.topic.findMany({
      where: { brandId },
      orderBy: { name: "asc" },
      include: { _count: { select: { prompts: { where: { deletedAt: null } } } } },
    });
    return topics.map(({ _count, ...t }) => ({ ...t, promptCount: _count.prompts }));
  }

  @Post()
  async create(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Body() body: CreateTopicDto) {
    await ownedBrand(this.prisma, ws, brandId);
    const existing = await this.prisma.topic.findFirst({ where: { brandId, name: { equals: body.name, mode: "insensitive" } } });
    return existing ?? this.prisma.topic.create({ data: { brandId, name: body.name } });
  }

  /** Removes the topic; its prompts stay, without a topic. */
  @Delete(":topicId")
  @HttpCode(204)
  async remove(@CurrentWorkspace() ws: Workspace, @Param("brandId", ParseUUIDPipe) brandId: string, @Param("topicId", ParseUUIDPipe) topicId: string) {
    await ownedBrand(this.prisma, ws, brandId);
    const topic = await this.prisma.topic.findFirst({ where: { id: topicId, brandId } });
    if (!topic) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.prompt.updateMany({ where: { topicId }, data: { topicId: null } }),
      this.prisma.topic.delete({ where: { id: topicId } }),
    ]);
  }
}
