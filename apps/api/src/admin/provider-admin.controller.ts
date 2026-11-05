import { PrismaClient } from "@avt/db";
import { PROVIDER_MODELS, providersFromEnv } from "@avt/providers";
import { ModelTag, TestProvider, UpdateProviderRoute } from "@avt/shared";
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { createZodDto } from "nestjs-zod";

class UpdateProviderRouteDto extends createZodDto(UpdateProviderRoute) {}
class TestProviderDto extends createZodDto(TestProvider) {}

const DEFAULT_PRIMARY = "cloro";
const DAY = 24 * 3600 * 1000;

type AdminRequest = Request & { userId?: string; adminEmail?: string };

/** Super-admins are us (the developers), listed by email in SUPER_ADMIN_EMAILS; never the client's users. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaClient) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const admins = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    const user = req.userId ? await this.prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } }) : null;
    if (!user || !admins.includes(user.email.toLowerCase())) throw new ForbiddenException("Super-admin only");
    req.adminEmail = user.email;
    return true;
  }
}

const AdminEmail = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().adminEmail!);

@Controller("admin/providers")
@UseGuards(SuperAdminGuard)
export class ProviderAdminController {
  constructor(private readonly prisma: PrismaClient) {}

  /** Routing per engine, provider health over 7 days, cost per 1,000 answers over 30 days, recent changes. */
  @Get()
  async overview() {
    const now = Date.now();
    const configured = Object.keys(providersFromEnv());
    const rows = await this.prisma.providerRoute.findMany();
    const routes = ModelTag.options.map((model) => {
      const r = rows.find((x) => x.model === model);
      return r ?? { model, primary: DEFAULT_PRIMARY, fallback: null, enabled: true, updatedBy: null, updatedAt: null };
    });

    const since = new Date(now - 7 * DAY);
    const counts = await this.prisma.answer.groupBy({
      by: ["provider", "model", "status"],
      where: { capturedAt: { gte: since } },
      _count: true,
      _avg: { latencyMs: true },
    });
    const keys = [...new Set(counts.map((c) => `${c.provider}|${c.model}`))];
    const health = await Promise.all(
      keys.map(async (key) => {
        const [provider, model] = key.split("|") as [string, ModelTag];
        const mine = counts.filter((c) => c.provider === provider && c.model === model);
        const n = (s: string) => mine.find((c) => c.status === s)?._count ?? 0;
        const total = mine.reduce((s, c) => s + c._count, 0);
        const ok = mine.filter((c) => c.status !== "FAILED");
        const latency = ok.reduce((s, c) => s + (c._avg.latencyMs ?? 0) * c._count, 0) / Math.max(1, ok.reduce((s, c) => s + c._count, 0));
        const lastError = await this.prisma.answer.findFirst({
          where: { provider, model, status: "FAILED", capturedAt: { gte: since } },
          orderBy: { capturedAt: "desc" },
          select: { error: true, capturedAt: true },
        });
        return {
          provider,
          model,
          answers: total,
          successRate: total ? (total - n("FAILED")) / total : null,
          noAiResultRate: total ? n("NO_AI_RESULT") / total : null,
          avgLatencyMs: Math.round(latency) || null,
          lastError: lastError?.error ?? null,
          lastErrorAt: lastError?.capturedAt ?? null,
        };
      }),
    );

    const usage = await this.prisma.providerUsage.groupBy({
      by: ["provider", "model"],
      where: { day: { gte: new Date(now - 30 * DAY) } },
      _sum: { calls: true, credits: true, usd: true },
    });
    const costPer1k = usage.map((u) => {
      const calls = u._sum.calls ?? 0;
      return {
        provider: u.provider,
        model: u.model,
        calls,
        creditsPer1k: calls ? (Number(u._sum.credits ?? 0) / calls) * 1000 : null,
        usdPer1k: calls ? (Number(u._sum.usd ?? 0) / calls) * 1000 : null,
      };
    });

    const changes = await this.prisma.auditLog.findMany({ where: { action: "provider-route.update" }, orderBy: { createdAt: "desc" }, take: 20 });
    return { providers: Object.entries(PROVIDER_MODELS).map(([name, models]) => ({ name, models, configured: configured.includes(name) })), routes, health, costPer1k, changes };
  }

  /** Switches routing for one engine. Workers pick it up within 30s; every change is audited. */
  @Put(":model")
  async update(@Param("model") model: string, @Body() body: UpdateProviderRouteDto, @AdminEmail() actor: string) {
    const m = ModelTag.safeParse(model);
    if (!m.success) throw new BadRequestException("Unknown engine");
    for (const p of [body.primary, body.fallback]) {
      if (p && !PROVIDER_MODELS[p]?.includes(m.data)) throw new BadRequestException(`${p} cannot capture ${m.data}`);
    }
    if (body.fallback === body.primary) throw new BadRequestException("Fallback must differ from primary");

    const before = await this.prisma.providerRoute.findUnique({ where: { model: m.data } });
    const after = await this.prisma.providerRoute.upsert({
      where: { model: m.data },
      update: { ...body, updatedBy: actor },
      create: { model: m.data, ...body, updatedBy: actor },
    });
    await this.prisma.auditLog.create({
      data: {
        actor,
        action: "provider-route.update",
        target: m.data,
        before: before ? { primary: before.primary, fallback: before.fallback, enabled: before.enabled } : { primary: DEFAULT_PRIMARY, fallback: null, enabled: true },
        after: { primary: after.primary, fallback: after.fallback, enabled: after.enabled },
      },
    });
    return after;
  }

  /** Runs one real prompt through a provider and returns the parsed result. Spends credits. */
  @Post("test")
  async test(@Body() body: TestProviderDto) {
    const provider = providersFromEnv()[body.provider];
    if (!provider) throw new BadRequestException(`${body.provider} has no credentials configured`);
    if (!provider.supports(body.model)) throw new BadRequestException(`${body.provider} cannot capture ${body.model}`);
    try {
      const r = await provider.capture({ prompt: body.prompt, model: body.model, country: body.country, language: "en", wantFanout: true });
      return { ok: true, status: r.status, text: r.text?.slice(0, 3000) ?? null, citations: r.citations, fanout: r.fanout, cost: r.cost, latencyMs: r.latencyMs };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
