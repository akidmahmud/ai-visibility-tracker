-- CreateTable
CREATE TABLE "DailyPromptRollup" (
    "brandId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "model" "ModelTag" NOT NULL,
    "day" DATE NOT NULL,
    "answers" INTEGER NOT NULL DEFAULT 0,
    "noAiResult" INTEGER NOT NULL DEFAULT 0,
    "mentions" INTEGER NOT NULL DEFAULT 0,
    "scoreSum" INTEGER NOT NULL DEFAULT 0,
    "rankSum" INTEGER NOT NULL DEFAULT 0,
    "citations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPromptRollup_pkey" PRIMARY KEY ("brandId","promptId","entityId","model","day")
);

-- CreateIndex
CREATE INDEX "DailyPromptRollup_brandId_day_idx" ON "DailyPromptRollup"("brandId", "day");
