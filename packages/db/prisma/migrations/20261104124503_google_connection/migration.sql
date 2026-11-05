-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "ga4PropertyId" TEXT,
ADD COLUMN     "gscProperty" TEXT;

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_workspaceId_key" ON "GoogleConnection"("workspaceId");

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
