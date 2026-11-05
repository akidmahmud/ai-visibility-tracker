import type { Workspace } from "@avt/db";
import { PrismaClient } from "@avt/db";
import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { TokenVerifier } from "./token-verifier";

const PUBLIC = "isPublic";
export const Public = () => SetMetadata(PUBLIC, true);

const READ_SAFE = "readSafe";
/** A non-GET route that only reads (e.g. MCP's JSON-RPC POST): allowed for read-only API keys. */
export const ReadSafe = () => SetMetadata(READ_SAFE, true);

type AuthedRequest = Request & { workspace?: Workspace; userId?: string; apiKeyId?: string };

/** The caller's workspace. Every query must filter by this id. */
export const CurrentWorkspace = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().workspace!,
);

/**
 * Global guard: Better Auth session token → active organization → Workspace.
 * The workspace is provisioned on first use of an org (creating an org = creating a workspace).
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly prisma: PrismaClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();

    const id = await this.verifier.verify(token).catch(() => {
      throw new UnauthorizedException();
    });
    if (!id.orgId) throw new ForbiddenException("Select or create an organization first");

    // read-only API keys may only read
    const readSafe = this.reflector.getAllAndOverride<boolean>(READ_SAFE, [ctx.getHandler(), ctx.getClass()]);
    if (id.apiKey?.scope === "read" && req.method !== "GET" && !readSafe) throw new ForbiddenException("This API key is read-only");
    req.userId = id.userId;
    req.apiKeyId = id.apiKey?.id;
    req.workspace =
      (await this.prisma.workspace.findUnique({ where: { organizationId: id.orgId } })) ??
      (await this.createWorkspace(id.orgId));
    return true;
  }

  private async createWorkspace(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    // upsert absorbs the race when two first requests arrive together
    return this.prisma.workspace.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId, name: org.name },
    });
  }
}
