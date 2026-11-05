-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "customDomain" TEXT;

-- CreateTable
CREATE TABLE "PeekabooBaseline" (
    "brandId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeekabooBaseline_pkey" PRIMARY KEY ("brandId","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_customDomain_key" ON "Workspace"("customDomain");

