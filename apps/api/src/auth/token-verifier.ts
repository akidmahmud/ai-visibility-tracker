import { PrismaClient } from "@avt/db";
import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

export type Identity = { userId: string; orgId: string | null; apiKey?: { id: string; scope: "read" | "write" } };

export const API_KEY_PREFIX = "avt_";
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/**
 * Bearer token = Better Auth session token (issued by the web app, stored in our Session table), or a
 * workspace API key ("avt_…", public REST API and MCP). Session: checks expiry and that the user really
 * belongs to the session's active organization. API key: must exist and not be revoked.
 */
@Injectable()
export class TokenVerifier {
  constructor(private readonly prisma: PrismaClient) {}

  async verify(token: string): Promise<Identity> {
    if (token.startsWith(API_KEY_PREFIX)) return this.verifyApiKey(token);
    const s = await this.prisma.session.findUnique({ where: { token } });
    if (!s || s.expiresAt <= new Date()) throw new Error("invalid session");
    const orgId = s.activeOrganizationId;
    if (orgId) {
      const member = await this.prisma.member.findFirst({ where: { userId: s.userId, organizationId: orgId } });
      if (!member) return { userId: s.userId, orgId: null };
    }
    return { userId: s.userId, orgId };
  }

  private async verifyApiKey(key: string): Promise<Identity> {
    const k = await this.prisma.apiKey.findUnique({ where: { hash: hashKey(key) }, include: { workspace: { select: { organizationId: true } } } });
    if (!k || k.revokedAt) throw new Error("invalid api key");
    // last-used is informational: write it at most hourly
    if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 3600_000) {
      await this.prisma.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } });
    }
    return { userId: `apikey:${k.id}`, orgId: k.workspace.organizationId, apiKey: { id: k.id, scope: k.scope === "write" ? "write" : "read" } };
  }
}
