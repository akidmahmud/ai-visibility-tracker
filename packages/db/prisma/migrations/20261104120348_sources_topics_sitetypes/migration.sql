/*
  Warnings:

  - The primary key for the `DailyCitationRollup` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `promptId` to the `DailyCitationRollup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `url` to the `DailyCitationRollup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DailyCitationRollup" DROP CONSTRAINT "DailyCitationRollup_pkey",
ADD COLUMN     "promptId" TEXT NOT NULL,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "url" TEXT NOT NULL,
ADD CONSTRAINT "DailyCitationRollup_pkey" PRIMARY KEY ("brandId", "promptId", "url", "model", "day");

-- AlterTable
ALTER TABLE "DailyPromptRollup" ADD COLUMN     "negative" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "neutral" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "positive" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SiteClassification" (
    "domain" TEXT NOT NULL,
    "siteType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteClassification_pkey" PRIMARY KEY ("domain")
);

-- CreateIndex
CREATE INDEX "DailyCitationRollup_brandId_day_idx" ON "DailyCitationRollup"("brandId", "day");
