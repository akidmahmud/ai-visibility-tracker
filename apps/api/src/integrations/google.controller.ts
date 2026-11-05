import type { PrismaClient as Db, Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, ServiceUnavailableException } from "@nestjs/common";
import { CurrentWorkspace } from "../auth/workspace.guard";
import { decrypt, encrypt, makeState, readState } from "./crypto";
import { accessToken, authUrl, exchangeCode, ga4Properties, googleConfigured, gscSites } from "./google";

/** Access token for the workspace's Google connection, or null when not connected. */
export async function googleAccess(prisma: Db, workspaceId: string): Promise<string | null> {
  if (!googleConfigured()) return null;
  const conn = await prisma.googleConnection.findUnique({ where: { workspaceId } });
  return conn ? accessToken(decrypt(conn.refreshToken)) : null;
}

/** Connect the agency's Google account (Search Console + GA4, read-only). */
@Controller("integrations/google")
export class GoogleController {
  constructor(private readonly prisma: PrismaClient) {}

  @Get()
  async status(@CurrentWorkspace() ws: Workspace) {
    const conn = await this.prisma.googleConnection.findUnique({ where: { workspaceId: ws.id } });
    return { configured: googleConfigured(), connected: !!conn, email: conn?.email ?? null };
  }

  @Get("start")
  start(@CurrentWorkspace() ws: Workspace) {
    if (!googleConfigured()) throw new ServiceUnavailableException("Google sign-in is not set up (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
    return { url: authUrl(makeState(ws.id)) };
  }

  /** Google redirects to the web app, which forwards the code here with the user's session. */
  @Post("callback")
  async callback(@CurrentWorkspace() ws: Workspace, @Body() body: { code?: string; state?: string }) {
    if (!body.code || !body.state || readState(body.state) !== ws.id) throw new BadRequestException("This Google sign-in link expired or belongs to another workspace");
    const t = await exchangeCode(body.code);
    if (!t.refreshToken) throw new BadRequestException("Google did not return offline access; try connecting again");
    const data = { email: t.email, refreshToken: encrypt(t.refreshToken), scopes: t.scopes };
    await this.prisma.googleConnection.upsert({ where: { workspaceId: ws.id }, update: data, create: { ...data, workspaceId: ws.id } });
    return { connected: true, email: t.email };
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@CurrentWorkspace() ws: Workspace) {
    await this.prisma.googleConnection.deleteMany({ where: { workspaceId: ws.id } });
  }

  /** Search Console sites and GA4 properties this account can read, for the brand settings. */
  @Get("properties")
  async properties(@CurrentWorkspace() ws: Workspace) {
    const access = await googleAccess(this.prisma, ws.id);
    if (!access) return { gsc: [], ga4: [] };
    const [gsc, ga4] = await Promise.all([gscSites(access).catch(() => []), ga4Properties(access).catch(() => [])]);
    return { gsc, ga4 };
  }
}
