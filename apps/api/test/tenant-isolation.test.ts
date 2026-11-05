import { createPrisma } from "@avt/db";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { Jobs } from "../src/jobs";

const jobs = { startRun: vi.fn(async () => {}), enqueue: vi.fn(async () => {}) };

// Real auth path: rows shaped like Better Auth's, real TokenVerifier. Requires Postgres with migrations applied.
const prisma = createPrisma();
const day = 24 * 3600 * 1000;

async function sessionFor(opts: { orgId?: string; member?: boolean; expired?: boolean } = {}) {
  const userId = randomUUID();
  const token = randomUUID();
  await prisma.user.create({ data: { id: userId, name: "Test", email: `${userId}@test.local` } });
  if (opts.orgId && opts.member !== false) {
    await prisma.member.create({ data: { id: randomUUID(), organizationId: opts.orgId, userId, role: "owner" } });
  }
  await prisma.session.create({
    data: {
      id: randomUUID(),
      token,
      userId,
      activeOrganizationId: opts.orgId ?? null,
      expiresAt: new Date(Date.now() + (opts.expired ? -day : day)),
    },
  });
  return { Authorization: `Bearer ${token}` };
}

async function org() {
  const id = randomUUID();
  await prisma.organization.create({ data: { id, name: `Agency ${id.slice(0, 6)}`, slug: id } });
  return id;
}

describe("tenant isolation", () => {
  let app: INestApplication;
  let a: Record<string, string>, b: Record<string, string>;
  let orgB: string;
  let brandId: string;

  beforeAll(async () => {
    const orgA = await org();
    orgB = await org();
    a = await sessionFor({ orgId: orgA });
    b = await sessionFor({ orgId: orgB });

    // never enqueue real jobs from tests: a running worker would capture them with real (paid) providers
    const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Jobs).useValue(jobs).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();

    const res = await request(app.getHttpServer())
      .post("/api/brands")
      .set(a)
      .send({ name: "Acme Law", websiteUrl: "https://www.AcmeLaw.com/about" });
    expect(res.status).toBe(201);
    expect(res.body.domain).toBe("acmelaw.com");
    brandId = res.body.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it("rejects missing, unknown and expired tokens", async () => {
    const http = () => request(app.getHttpServer());
    await http().get("/api/brands").expect(401);
    await http().get("/api/brands").set({ Authorization: "Bearer nope" }).expect(401);
    await http().get("/api/brands").set(await sessionFor({ expired: true })).expect(401);
  });

  it("rejects sessions with no org, or an org the user is not a member of", async () => {
    await request(app.getHttpServer()).get("/api/brands").set(await sessionFor()).expect(403);
    await request(app.getHttpServer()).get("/api/brands").set(await sessionFor({ orgId: orgB, member: false })).expect(403);
  });

  it("owner can read the brand", async () => {
    await request(app.getHttpServer()).get(`/api/brands/${brandId}`).set(a).expect(200);
  });

  it("another workspace cannot see, edit, or delete it", async () => {
    const list = await request(app.getHttpServer()).get("/api/brands").set(b).expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).not.toContain(brandId);
    await request(app.getHttpServer()).get(`/api/brands/${brandId}`).set(b).expect(404);
    await request(app.getHttpServer()).patch(`/api/brands/${brandId}`).set(b).send({ name: "pwned" }).expect(404);
    await request(app.getHttpServer()).delete(`/api/brands/${brandId}`).set(b).expect(404);

    const after = await request(app.getHttpServer()).get(`/api/brands/${brandId}`).set(a).expect(200);
    expect(after.body.name).toBe("Acme Law");
  });

  it("brand-scoped routes (prompts, competitors, runs, run-now) are isolated too", async () => {
    const http = () => request(app.getHttpServer());
    await http().post(`/api/brands/${brandId}/prompts`).set(a).send({ texts: ["best law firm in chicago", "Best law firm in Chicago"] })
      .expect(201, { created: 1, skipped: 1 });
    for (const path of ["prompts", "competitors", "runs"]) await http().get(`/api/brands/${brandId}/${path}`).set(b).expect(404);
    await http().post(`/api/brands/${brandId}/prompts`).set(b).send({ texts: ["x prompt"] }).expect(404);
    await http().post(`/api/brands/${brandId}/competitors`).set(b).send({ name: "Rival" }).expect(404);
    await http().post(`/api/brands/${brandId}/run-now`).set(b).expect(404);
    const prompts = await http().get(`/api/brands/${brandId}/prompts`).set(a).expect(200);
    expect(prompts.body).toHaveLength(1);
  });

  it("provider routing is super-admin only, validated and audited", async () => {
    const http = () => request(app.getHttpServer());
    await http().get("/api/admin/providers").set(a).expect(403);

    const adminEmail = `admin-${randomUUID()}@test.local`;
    process.env.SUPER_ADMIN_EMAILS = `someone@else.com, ${adminEmail.toUpperCase()}`;
    const admin = await sessionFor({ orgId: orgB });
    const session = await prisma.session.findUniqueOrThrow({ where: { token: admin.Authorization.slice(7) } });
    await prisma.user.update({ where: { id: session.userId }, data: { email: adminEmail } });

    const overview = await http().get("/api/admin/providers").set(admin).expect(200);
    expect(overview.body.routes).toHaveLength(7);
    await http().put("/api/admin/providers/chatgpt").set(admin).send({ primary: "dataforseo", fallback: null, enabled: true }).expect(400);
    await http().put("/api/admin/providers/nope").set(admin).send({ primary: "cloro", fallback: null, enabled: true }).expect(400);
    await http().put("/api/admin/providers/google_aio").set(admin).send({ primary: "cloro", fallback: "dataforseo", enabled: true }).expect(200);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { target: "google_aio", actor: adminEmail }, orderBy: { createdAt: "desc" } });
    expect(audit.after).toEqual({ primary: "cloro", fallback: "dataforseo", enabled: true });
    await prisma.providerRoute.deleteMany({ where: { model: "google_aio" } });
  });

  it("summary reads rollups: visibility, mention rate, position, AI-answer rate, ranked entities", async () => {
    const self = await prisma.entity.create({ data: { canonicalName: "Acme Law" } });
    const rival = await prisma.entity.create({ data: { canonicalName: "Rival LLP" } });
    await prisma.brand.update({ where: { id: brandId }, data: { entityId: self.id } });
    await prisma.competitor.create({ data: { brandId, entityId: rival.id, isTracked: true } });
    const day = new Date(new Date().toISOString().slice(0, 10));
    const row = { brandId, model: "chatgpt" as const, day, answers: 4, noAiResult: 1, neutral: 0, negative: 0 };
    await prisma.dailyRollup.createMany({
      data: [
        { ...row, entityId: self.id, mentions: 2, scoreSum: 175, rankSum: 3, positive: 2 }, // ranks 1 and 2 of 4 → 100 + 75
        { ...row, entityId: rival.id, mentions: 3, scoreSum: 150, rankSum: 6, positive: 1, neutral: 2 },
      ],
    });

    const res = await request(app.getHttpServer()).get(`/api/brands/${brandId}/summary?days=7`).set(a).expect(200);
    expect(res.body.brand).toMatchObject({ kind: "SELF", visibility: 43.75, mentionRate: 0.5, avgPosition: 1.5, sentimentPct: 1, aiResultRate: 0.8 });
    expect(res.body.entities.map((e: { name: string; shareOfVoice: number }) => [e.name, e.shareOfVoice])).toEqual([
      ["Acme Law", 0.4],
      ["Rival LLP", 0.6],
    ]);
    await request(app.getHttpServer()).get(`/api/brands/${brandId}/summary`).set(b).expect(404);
    await request(app.getHttpServer()).get(`/api/brands/${brandId}/summary?models=nope`).set(a).expect(400);
  });

  it("topics: scoped to the brand; topic/intent filters read the per-prompt rollup", async () => {
    const http = () => request(app.getHttpServer());
    const topic = (await http().post(`/api/brands/${brandId}/topics`).set(a).send({ name: "Phoenix" }).expect(201)).body;
    await http().get(`/api/brands/${brandId}/topics`).set(b).expect(404);
    await http().post(`/api/brands/${brandId}/prompts`).set(a).send({ texts: ["phoenix prompt one"], topicId: randomUUID() }).expect(400);
    await http().post(`/api/brands/${brandId}/prompts`).set(a).send({ texts: ["phoenix prompt one"], topicId: topic.id, intent: "INFORMATIONAL" }).expect(201);
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { brandId, text: "phoenix prompt one" } });
    const other = await prisma.prompt.findFirstOrThrow({ where: { brandId, text: "best law firm in chicago" } });

    const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
    const rival = await prisma.competitor.findFirstOrThrow({ where: { brandId } });
    const day = new Date(new Date().toISOString().slice(0, 10));
    const row = { brandId, model: "gemini" as const, day, noAiResult: 0, rankSum: 0, citations: 0, positive: 0, neutral: 0, negative: 0 };
    await prisma.dailyPromptRollup.createMany({
      data: [
        { ...row, promptId: prompt.id, entityId: brand.entityId!, answers: 2, mentions: 1, scoreSum: 100, rankSum: 1 }, // Phoenix: you 50
        { ...row, promptId: prompt.id, entityId: rival.entityId, answers: 2, mentions: 2, scoreSum: 150, rankSum: 3 }, // rival 75
        { ...row, promptId: other.id, entityId: brand.entityId!, answers: 4, mentions: 0, scoreSum: 0 },
      ],
    });

    const phoenix = await http().get(`/api/brands/${brandId}/summary?days=7&topics=${topic.id}`).set(a).expect(200);
    expect(phoenix.body.brand).toMatchObject({ answers: 2, visibility: 50, mentionRate: 0.5 });
    expect(phoenix.body.entities.find((e: { kind: string }) => e.kind === "COMPETITOR")).toMatchObject({ visibility: 75, answers: 2 });
    const informational = await http().get(`/api/brands/${brandId}/summary?days=7&intents=INFORMATIONAL`).set(a).expect(200);
    expect(informational.body.brand.visibility).toBe(50);
    const commercial = await http().get(`/api/brands/${brandId}/prompt-metrics?days=7&intents=COMMERCIAL`).set(a).expect(200);
    expect(commercial.body.prompts.map((p: { text: string }) => p.text)).not.toContain("phoenix prompt one");
    await http().get(`/api/brands/${brandId}/summary?intents=NOPE`).set(a).expect(400);

    await http().delete(`/api/brands/${brandId}/topics/${topic.id}`).set(a).expect(204);
    expect((await prisma.prompt.findUniqueOrThrow({ where: { id: prompt.id } })).topicId).toBeNull();
  });

  it("sources group by site or by page", async () => {
    const prompt = await prisma.prompt.findFirstOrThrow({ where: { brandId } });
    const day = new Date(new Date().toISOString().slice(0, 10));
    const row = { brandId, promptId: prompt.id, model: "chatgpt" as const, day, domain: "reddit.com" };
    await prisma.dailyCitationRollup.createMany({
      data: [
        { ...row, url: "https://reddit.com/r/a", title: "Thread A", count: 3 },
        { ...row, url: "https://reddit.com/r/b", title: "Thread B", count: 1 },
      ],
    });
    const sites = await request(app.getHttpServer()).get(`/api/brands/${brandId}/sources?days=7`).set(a).expect(200);
    expect(sites.body.domains).toEqual([expect.objectContaining({ domain: "reddit.com", count: 4, siteType: "Forums & Communities", url: null })]);
    const pages = await request(app.getHttpServer()).get(`/api/brands/${brandId}/sources?days=7&view=urls`).set(a).expect(200);
    expect(pages.body.domains.map((d: { url: string; title: string; count: number }) => [d.url, d.title, d.count])).toEqual([
      ["https://reddit.com/r/a", "Thread A", 3],
      ["https://reddit.com/r/b", "Thread B", 1],
    ]);
  });

  it("share links: owner-managed, public read-only, tab-gated, revocable", async () => {
    const http = () => request(app.getHttpServer());
    await http().post(`/api/brands/${brandId}/share-links`).set(b).send({ visibleTabs: ["dashboard"] }).expect(404);
    const link = (await http().post(`/api/brands/${brandId}/share-links`).set(a).send({ visibleTabs: ["dashboard", "sources"] }).expect(201)).body;
    expect(link.token.length).toBeGreaterThanOrEqual(32);

    const open = await http().get(`/api/public/share/${link.token}`).expect(200); // no Authorization header
    expect(open.body).toMatchObject({ brand: { name: "Acme Law" }, visibleTabs: ["dashboard", "sources"] });
    const dash = await http().get(`/api/public/share/${link.token}/dashboard?days=7`).expect(200);
    expect(dash.body.summary.brand.visibility).toBe(43.75);
    await http().get(`/api/public/share/${link.token}/sources`).expect(200);
    await http().get(`/api/public/share/${link.token}/competitors`).expect(403); // tab not shared
    await http().get(`/api/public/share/not-a-real-token`).expect(404);

    const list = await http().get(`/api/brands/${brandId}/share-links`).set(a).expect(200);
    expect(list.body[0]).toMatchObject({ id: link.id, openCount: 1 });
    await http().get(`/api/brands/${brandId}/share-links`).set(b).expect(404);

    await http().delete(`/api/brands/${brandId}/share-links/${link.id}`).set(b).expect(404);
    await http().delete(`/api/brands/${brandId}/share-links/${link.id}`).set(a).expect(204);
    await http().get(`/api/public/share/${link.token}`).expect(404);
  });

  it("action plan, site check, briefs and prompt suggestions are brand-scoped", async () => {
    const http = () => request(app.getHttpServer());
    const todo = await prisma.todo.create({
      data: {
        brandId, ruleId: "cited-not-you", subject: "clutch.co", title: "Get listed on clutch.co", detail: "d", priority: "HIGH", effort: "M",
        gapPoints: 30, type: "OFF_PAGE", category: "Backlinks & PR", models: [], evidence: { citations: 3 },
      },
    });
    const list = await http().get(`/api/brands/${brandId}/todos`).set(a).expect(200);
    expect(list.body.map((t: { id: string; evidence: unknown }) => [t.id, t.evidence])).toEqual([[todo.id, { citations: 3 }]]);
    await http().get(`/api/brands/${brandId}/todos`).set(b).expect(404);
    await http().get(`/api/brands/${brandId}/todos?status=NOPE`).set(a).expect(400);
    await http().patch(`/api/brands/${brandId}/todos/${todo.id}`).set(b).send({ status: "DONE" }).expect(404);
    await http().patch(`/api/brands/${brandId}/todos/${todo.id}`).set(a).send({ status: "TODO" }).expect(200);

    await http().post(`/api/brands/${brandId}/todos/generate`).set(a).expect(202);
    await http().post(`/api/brands/${brandId}/site-check`).set(a).expect(202);
    expect(jobs.enqueue).toHaveBeenCalledWith("insights", brandId);
    expect(jobs.enqueue).toHaveBeenCalledWith("site-check", brandId);
    expect((await http().get(`/api/brands/${brandId}/site-check`).set(a).expect(200)).body).toEqual({ check: null });

    const prompt = await prisma.prompt.findFirstOrThrow({ where: { brandId } });
    await http().post(`/api/brands/${brandId}/briefs`).set(b).send({ promptId: prompt.id }).expect(404);
    await http().post(`/api/brands/${brandId}/briefs`).set(a).send({ promptId: prompt.id }).expect(503); // no AI key in tests
    const suggest = await http().post(`/api/brands/${brandId}/prompts/suggest`).set(a).expect(201);
    expect(suggest.body).toMatchObject({ suggestions: [], note: expect.stringMatching(/No AI model/) });
  });

  it("white-label: branding saved per workspace; custom domains are unique and gate certificate issuance", async () => {
    const http = () => request(app.getHttpServer());
    const domain = `reports-${randomUUID().slice(0, 8)}.agency.com`;
    await http().patch("/api/workspace").set(a).send({ whiteLabel: { agencyName: "Agency A", primaryColor: "#1d4ed8" }, customDomain: domain.toUpperCase() }).expect(200);
    await http().patch("/api/workspace").set(b).send({ customDomain: domain }).expect(409);
    await http().patch("/api/workspace").set(a).send({ whiteLabel: { primaryColor: "blue" } }).expect(400);
    await http().patch("/api/workspace").set(a).send({ customDomain: "not a domain" }).expect(400);

    await http().get(`/api/public/domains/check?domain=${domain}`).expect(200); // no auth: Caddy calls this
    await http().get("/api/public/domains/check?domain=evil.example.com").expect(404);

    const link = (await http().post(`/api/brands/${brandId}/share-links`).set(a).send({}).expect(201)).body;
    const open = await http().get(`/api/public/share/${link.token}`).expect(200);
    expect(open.body.agency).toMatchObject({ whiteLabel: { agencyName: "Agency A" }, customDomain: domain });

    const usage = await http().get("/api/workspace/usage").set(a).expect(200);
    expect(usage.body).toMatchObject({ days: 30, totals: { answers: expect.any(Number) } });
  });

  it("API keys: workspace-scoped, read-only enforced, revocable; MCP tools work with a key", async () => {
    const http = () => request(app.getHttpServer());
    const created = (await http().post("/api/api-keys").set(a).send({ name: "Looker", scope: "read" }).expect(201)).body;
    expect(created.key).toMatch(/^avt_/);
    const key = { Authorization: `Bearer ${created.key}` };

    const brands = await http().get("/api/brands").set(key).expect(200);
    expect(brands.body.map((x: { id: string }) => x.id)).toContain(brandId);
    await http().get(`/api/brands/${brandId}/summary`).set(key).expect(200);
    await http().post("/api/brands").set(key).send({ name: "x", websiteUrl: "x.com" }).expect(403); // read-only
    await http().post("/api/api-keys").set(key).send({ name: "escalate" }).expect(403); // keys can't mint keys
    const list = await http().get("/api/api-keys").set(a).expect(200);
    expect(list.body[0]).not.toHaveProperty("hash");
    await http().get("/api/api-keys").set(b).expect(200).expect((r) => expect(r.body.map((k: { id: string }) => k.id)).not.toContain(created.id));

    // MCP: stateless Streamable HTTP, JSON-RPC over POST
    const rpc = async (method: string, params: object, id = 1) => {
      const res = await http()
        .post("/api/mcp")
        .set(key)
        .set("Accept", "application/json, text/event-stream")
        .send({ jsonrpc: "2.0", id, method, params })
        .expect(200);
      const text = res.text.includes("data:") ? res.text.split("\n").find((l) => l.startsWith("data:"))!.slice(5) : res.text;
      return JSON.parse(text);
    };
    const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.result.serverInfo.name).toBe("ai-visibility-tracker");
    const tools = await rpc("tools/list", {}, 2);
    expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(["list_brands", "get_brand_summary", "get_competitors", "get_prompts", "get_sources", "get_action_plan"]),
    );
    const call = await rpc("tools/call", { name: "list_brands", arguments: {} }, 3);
    expect(JSON.parse(call.result.content[0].text).map((x: { id: string }) => x.id)).toContain(brandId);

    await http().delete(`/api/api-keys/${created.id}`).set(a).expect(204);
    await http().get("/api/brands").set(key).expect(401);
  });

  it("AI crawler logs: per-brand ingest key, only AI bots counted; GA4 traffic needs a linked property", async () => {
    const http = () => request(app.getHttpServer());
    await http().post(`/api/brands/${brandId}/crawler-key`).set(b).expect(404);
    const { key } = (await http().post(`/api/brands/${brandId}/crawler-key`).set(a).expect(201)).body;
    const hits = {
      hits: [
        { ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", path: "/services?utm_source=x" },
        { ua: "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)", path: "/services" },
        { ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0)", path: "/" },
        { ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/130", path: "/" },
      ],
    };
    await http().post("/api/public/crawler-hits").set("x-crawler-key", "nope").send(hits).expect(401);
    expect((await http().post("/api/public/crawler-hits").set("x-crawler-key", key).send(hits).expect(202)).body).toEqual({ accepted: 3 });

    const stats = (await http().get(`/api/brands/${brandId}/crawlers`).set(a).expect(200)).body;
    expect(stats.bots).toEqual([
      { bot: "GPTBot", owner: "OpenAI", purpose: "training", hits: 2 },
      { bot: "PerplexityBot", owner: "Perplexity", purpose: "search", hits: 1 },
    ]);
    expect(stats.topPages[0]).toEqual({ path: "/services", hits: 2 });
    await http().get(`/api/brands/${brandId}/crawlers`).set(b).expect(404);

    expect((await http().get(`/api/brands/${brandId}/ai-traffic`).set(a).expect(200)).body).toMatchObject({ connected: false });
  });

  it("sources export as CSV", async () => {
    const res = await request(app.getHttpServer()).get(`/api/brands/${brandId}/sources?format=csv`).set(a).expect(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.text.split("\n")[0]).toMatch(/^domain,citations,google_results,answers,share,owner,site_type,last_seen/);
    expect(res.text).toContain("reddit.com,4,");
  });

  it("run-now is allowed once per 24h", async () => {
    await request(app.getHttpServer()).post(`/api/brands/${brandId}/run-now`).set(a).expect(202);
    await request(app.getHttpServer()).post(`/api/brands/${brandId}/run-now`).set(a).expect(429);
    expect(jobs.startRun).toHaveBeenCalledExactlyOnceWith(brandId);
  });

  it("validates input", async () => {
    await request(app.getHttpServer()).post("/api/brands").set(a).send({ name: "" }).expect(400);
  });
});
