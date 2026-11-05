-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "entityId" TEXT;

-- AlterTable
ALTER TABLE "DailyRollup" ADD COLUMN     "noAiResult" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
