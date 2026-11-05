import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { handleMcpRequest, type McpData } from "@avt/mcp";
import { All, Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import * as q from "./analytics/queries";
import { CurrentWorkspace, ReadSafe } from "./auth/workspace.guard";
import { ownedBrand } from "./brands/brand-scope";

/**
 * MCP server (Streamable HTTP, stateless) for Claude, ChatGPT, Cursor and other MCP clients.
 * Authenticate with a workspace API key: "Authorization: Bearer avt_…". Read-only tools.
 */
@Controller("mcp")
export class McpController {
  constructor(private readonly prisma: PrismaClient) {}

  @Post()
  @ReadSafe()
  async handle(@CurrentWorkspace() ws: Workspace, @Req() req: Request, @Res() res: Response) {
    await handleMcpRequest(req, res, req.body, this.data(ws));
  }

  /** Stateless server: no SSE stream to resume and no session to delete. */
  @All()
  other(@Res() res: Response) {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  }

  private data(ws: Workspace): McpData {
    const prisma = this.prisma;
    const brand = (id: string) => ownedBrand(prisma, ws, id);
    const f = (days: number, models?: string[]) => q.parseFilters(String(days), models?.join(","));
    return {
      listBrands: () =>
        prisma.brand.findMany({
          where: { workspaceId: ws.id, deletedAt: null },
          select: { id: true, name: true, domain: true, enabledModels: true, frequency: true, isActive: true },
          orderBy: { name: "asc" },
        }),
      summary: async (id, days, models) => q.summary(prisma, await brand(id), f(days, models)),
      competitors: async (id, days) => {
        const b = await brand(id);
        const [summary, heatmap] = await Promise.all([q.summary(prisma, b, f(days)), q.heatmap(prisma, b, f(days))]);
        return { leaderboard: summary.entities, byEngine: heatmap };
      },
      prompts: async (id, days) => q.prompts(prisma, await brand(id), f(days)),
      sources: async (id, days, view) => q.sources(prisma, await brand(id), f(days), view),
      actionPlan: async (id) => {
        const b = await brand(id);
        const [todos, siteCheck] = await Promise.all([
          prisma.todo.findMany({ where: { brandId: b.id, status: { in: ["SUGGESTED", "TODO"] } }, orderBy: { gapPoints: "desc" } }),
          prisma.siteCheck.findFirst({ where: { brandId: b.id }, orderBy: { checkedAt: "desc" } }),
        ]);
        return {
          todos: todos.map((t) => ({ title: t.title, detail: t.detail, priority: t.priority, status: t.status, category: t.category, evidence: t.evidence })),
          siteCheck: siteCheck?.results ?? null,
        };
      },
    };
  }
}
