-- AlterTable
ALTER TABLE "Citation" ADD COLUMN     "searchResult" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DailyCitationRollup" ADD COLUMN     "searchCount" INTEGER NOT NULL DEFAULT 0;

