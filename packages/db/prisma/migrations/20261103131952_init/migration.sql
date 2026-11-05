-- CreateEnum
CREATE TYPE "RunFrequency" AS ENUM ('DAILY', 'EVERY_2_DAYS', 'EVERY_3_DAYS', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ModelTag" AS ENUM ('chatgpt', 'gemini', 'perplexity', 'google_aio', 'google_ai_mode', 'copilot', 'claude');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('COMMERCIAL', 'INVESTIGATIONAL', 'INFORMATIONAL', 'NAVIGATIONAL');

-- CreateEnum
CREATE TYPE "PromptSource" AS ENUM ('MANUAL', 'SUGGESTED', 'GSC', 'FANOUT');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('OK', 'NO_AI_RESULT', 'FAILED');

-- CreateEnum
CREATE TYPE "MentionKind" AS ENUM ('SELF', 'COMPETITOR', 'UNTRACKED');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('SELF', 'COMPETITOR', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "FanoutKind" AS ENUM ('WEB', 'MAPS', 'SITE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Effort" AS ENUM ('S', 'M', 'L');

-- CreateEnum
CREATE TYPE "TodoType" AS ENUM ('ON_PAGE', 'OFF_PAGE', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('SUGGESTED', 'TODO', 'DONE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "whiteLabel" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "description" TEXT,
    "industry" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "country" TEXT NOT NULL DEFAULT 'US',
    "aliases" TEXT[],
    "frequency" "RunFrequency" NOT NULL DEFAULT 'WEEKLY',
    "enabledModels" "ModelTag"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastManualRunAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityAlias" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntityAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "isTracked" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "topicId" TEXT,
    "text" TEXT NOT NULL,
    "intent" "Intent" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "source" "PromptSource" NOT NULL DEFAULT 'MANUAL',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "promptCount" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "model" "ModelTag" NOT NULL,
    "status" "AnswerStatus" NOT NULL,
    "text" TEXT,
    "rawKey" TEXT,
    "provider" TEXT NOT NULL,
    "costCredits" DECIMAL(65,30),
    "latencyMs" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "extractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "MentionKind" NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalInAnswer" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "sentiment" "Sentiment" NOT NULL,
    "sentimentConfidence" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "position" INTEGER NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "siteType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanoutQuery" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "kind" "FanoutKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanoutQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRollup" (
    "brandId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "model" "ModelTag" NOT NULL,
    "day" DATE NOT NULL,
    "answers" INTEGER NOT NULL DEFAULT 0,
    "mentions" INTEGER NOT NULL DEFAULT 0,
    "scoreSum" INTEGER NOT NULL DEFAULT 0,
    "rankSum" INTEGER NOT NULL DEFAULT 0,
    "positive" INTEGER NOT NULL DEFAULT 0,
    "neutral" INTEGER NOT NULL DEFAULT 0,
    "negative" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRollup_pkey" PRIMARY KEY ("brandId","entityId","model","day")
);

-- CreateTable
CREATE TABLE "DailyCitationRollup" (
    "brandId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "model" "ModelTag" NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCitationRollup_pkey" PRIMARY KEY ("brandId","domain","model","day")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "effort" "Effort" NOT NULL,
    "gapPoints" DOUBLE PRECISION NOT NULL,
    "type" "TodoType" NOT NULL,
    "category" TEXT NOT NULL,
    "models" "ModelTag"[],
    "status" "TodoStatus" NOT NULL DEFAULT 'SUGGESTED',
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBrief" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCheck" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "visibleTabs" TEXT[],
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareOpen" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT NOT NULL,
    "ua" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsage" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" "ModelTag" NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "credits" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "usd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRoute" (
    "model" "ModelTag" NOT NULL,
    "primary" TEXT NOT NULL,
    "fallback" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRoute_pkey" PRIMARY KEY ("model")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Member_organizationId_idx" ON "Member"("organizationId");

-- CreateIndex
CREATE INDEX "Member_userId_idx" ON "Member"("userId");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_idx" ON "Invitation"("organizationId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_key" ON "Workspace"("organizationId");

-- CreateIndex
CREATE INDEX "Brand_workspaceId_idx" ON "Brand"("workspaceId");

-- CreateIndex
CREATE INDEX "Brand_isActive_nextRunAt_idx" ON "Brand"("isActive", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_domain_key" ON "Entity"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "EntityAlias_normalized_key" ON "EntityAlias"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_brandId_entityId_key" ON "Competitor"("brandId", "entityId");

-- CreateIndex
CREATE INDEX "Prompt_brandId_idx" ON "Prompt"("brandId");

-- CreateIndex
CREATE INDEX "Run_brandId_scheduledFor_idx" ON "Run"("brandId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Answer_brandId_capturedAt_idx" ON "Answer"("brandId", "capturedAt");

-- CreateIndex
CREATE INDEX "Answer_promptId_model_capturedAt_idx" ON "Answer"("promptId", "model", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_runId_promptId_model_key" ON "Answer"("runId", "promptId", "model");

-- CreateIndex
CREATE INDEX "Mention_brandId_entityId_idx" ON "Mention"("brandId", "entityId");

-- CreateIndex
CREATE INDEX "Mention_answerId_idx" ON "Mention"("answerId");

-- CreateIndex
CREATE INDEX "Citation_brandId_domain_idx" ON "Citation"("brandId", "domain");

-- CreateIndex
CREATE INDEX "Citation_answerId_idx" ON "Citation"("answerId");

-- CreateIndex
CREATE INDEX "FanoutQuery_answerId_idx" ON "FanoutQuery"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "Todo_brandId_ruleId_subject_key" ON "Todo"("brandId", "ruleId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUsage_day_provider_model_key" ON "ProviderUsage"("day", "provider", "model");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityAlias" ADD CONSTRAINT "EntityAlias_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanoutQuery" ADD CONSTRAINT "FanoutQuery_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheck" ADD CONSTRAINT "SiteCheck_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareOpen" ADD CONSTRAINT "ShareOpen_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
