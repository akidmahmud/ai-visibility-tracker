import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { randomBytes } from "node:crypto";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { API_KEY_PREFIX, hashKey } from "./auth/token-verifier";
import { CurrentWorkspace } from "./auth/workspace.guard";

class CreateKeyDto extends createZodDto(z.object({ name: z.string().trim().min(1).max(60), scope: z.enum(["read", "write"]).default("read") })) {}

/** Workspace API keys for the public REST API and the MCP server. Managed by signed-in users only. */
@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly prisma: PrismaClient) {}

  private humanOnly(req: Request & { apiKeyId?: string }) {
    if (req.apiKeyId) throw new ForbiddenException("API keys can't manage API keys");
  }

  @Get()
  async list(@CurrentWorkspace() ws: Workspace, @Req() req: Request) {
    this.humanOnly(req);
    return this.prisma.apiKey.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, prefix: true, scope: true, lastUsedAt: true, revokedAt: true, createdAt: true },
    });
  }

  /** The full key is returned once, here; only its hash is stored. */
  @Post()
  async create(@CurrentWorkspace() ws: Workspace, @Req() req: Request, @Body() body: CreateKeyDto) {
    this.humanOnly(req);
    const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
    const row = await this.prisma.apiKey.create({
      data: { workspaceId: ws.id, name: body.name, scope: body.scope, prefix: key.slice(0, 10), hash: hashKey(key) },
      select: { id: true, name: true, scope: true, prefix: true, createdAt: true },
    });
    return { ...row, key };
  }

  @Delete(":keyId")
  @HttpCode(204)
  async revoke(@CurrentWorkspace() ws: Workspace, @Req() req: Request, @Param("keyId", ParseUUIDPipe) keyId: string) {
    this.humanOnly(req);
    const { count } = await this.prisma.apiKey.updateMany({ where: { id: keyId, workspaceId: ws.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!count) throw new NotFoundException();
  }
}
