import { createPrisma, PrismaClient } from "@avt/db";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { ProviderAdminController } from "./admin/provider-admin.controller";
import { TokenVerifier } from "./auth/token-verifier";
import { WorkspaceGuard } from "./auth/workspace.guard";
import { AnalyticsController } from "./brands/analytics.controller";
import { BrandsController } from "./brands/brands.controller";
import { InsightsController } from "./brands/insights.controller";
import { SignalsController } from "./brands/signals.controller";
import { AskController } from "./brands/ask.controller";
import { AdminOverviewController } from "./admin/admin-overview.controller";
import { CompetitorsController } from "./brands/competitors.controller";
import { PromptsController } from "./brands/prompts.controller";
import { RunsController } from "./brands/runs.controller";
import { TopicsController } from "./brands/topics.controller";
import { ApiKeysController } from "./api-keys.controller";
import { Jobs } from "./jobs";
import { McpController } from "./mcp.controller";
import { GoogleController } from "./integrations/google.controller";
import { PublicShareController, ShareLinksController } from "./share/share-links.controller";
import { WorkspaceController } from "./workspace.controller";

@Module({
  controllers: [
    WorkspaceController,
    BrandsController,
    PromptsController,
    TopicsController,
    CompetitorsController,
    RunsController,
    AnalyticsController,
    InsightsController,
    SignalsController,
    AskController,
    AdminOverviewController,
    GoogleController,
    ApiKeysController,
    McpController,
    ShareLinksController,
    PublicShareController,
    ProviderAdminController,
  ],
  providers: [
    { provide: PrismaClient, useFactory: () => createPrisma() },
    TokenVerifier,
    Jobs,
    { provide: APP_GUARD, useClass: WorkspaceGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
  ],
})
export class AppModule {}
