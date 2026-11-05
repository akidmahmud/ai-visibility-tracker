import { PrismaClient } from "@avt/db";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { SuperAdminGuard } from "./provider-admin.controller";

const DAY = 24 * 3600 * 1000;

/** Super-admin home: every workspace and user, 30-day volume and spend, recent failures and admin changes. */
@Controller("admin/overview")
@UseGuards(SuperAdminGuard)
export class AdminOverviewController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async overview() {
    const since = new Date(Date.now() - 30 * DAY);
    const [workspaces, users, answers, usage, failures, audit] = await Promise.all([
      this.prisma.workspace.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          createdAt: true,
          customDomain: true,
          organization: { select: { _count: { select: { members: true } } } },
          brands: { select: { id: true, name: true, isActive: true, runs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, status: true } } } },
        },
      }),
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, email: true, name: true, createdAt: true, members: { select: { role: true, organization: { select: { name: true } } } }, sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } },
      }),
      this.prisma.answer.groupBy({ by: ["brandId", "status"], where: { capturedAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.providerUsage.aggregate({ where: { day: { gte: since } }, _sum: { calls: true, credits: true, usd: true } }),
      this.prisma.answer.findMany({
        where: { status: "FAILED", capturedAt: { gte: since } },
        orderBy: { capturedAt: "desc" },
        take: 15,
        select: { id: true, model: true, provider: true, error: true, capturedAt: true, brand: { select: { name: true } } },
      }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    const perBrand = new Map<string, { ok: number; failed: number }>();
    for (const a of answers) {
      const r = perBrand.get(a.brandId) ?? { ok: 0, failed: 0 };
      if (a.status === "FAILED") r.failed += a._count._all;
      else r.ok += a._count._all;
      perBrand.set(a.brandId, r);
    }
    const ws = workspaces.map((w) => {
      const counts = w.brands.map((b) => perBrand.get(b.id) ?? { ok: 0, failed: 0 });
      const lastRun = w.brands.flatMap((b) => b.runs).sort((a, b) => +b.createdAt - +a.createdAt)[0];
      return {
        id: w.id,
        name: w.name,
        createdAt: w.createdAt,
        customDomain: w.customDomain,
        members: w.organization._count.members,
        brands: w.brands.length,
        activeBrands: w.brands.filter((b) => b.isActive).length,
        answers30d: counts.reduce((s, c) => s + c.ok, 0),
        failed30d: counts.reduce((s, c) => s + c.failed, 0),
        lastRunAt: lastRun?.createdAt ?? null,
      };
    });
    return {
      totals: {
        workspaces: ws.length,
        users: users.length,
        brands: ws.reduce((s, w) => s + w.brands, 0),
        answers30d: ws.reduce((s, w) => s + w.answers30d, 0),
        failed30d: ws.reduce((s, w) => s + w.failed30d, 0),
        calls30d: usage._sum.calls ?? 0,
        credits30d: Number(usage._sum.credits ?? 0),
        usd30d: Number(usage._sum.usd ?? 0),
      },
      workspaces: ws,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
        workspaces: u.members.map((m) => `${m.organization.name} (${m.role})`),
        lastSeenAt: u.sessions[0]?.updatedAt ?? null,
      })),
      failures,
      audit,
    };
  }
}
