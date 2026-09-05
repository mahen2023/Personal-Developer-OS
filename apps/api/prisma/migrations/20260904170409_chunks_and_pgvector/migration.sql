-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "extractedText" TEXT;

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "projectId" UUID,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(384) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chunks_userId_idx" ON "chunks"("userId");

-- CreateIndex
CREATE INDEX "chunks_projectId_idx" ON "chunks"("projectId");

-- CreateIndex
CREATE INDEX "chunks_entityType_entityId_idx" ON "chunks"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_entityType_entityId_ordinal_key" ON "chunks"("entityType", "entityId", "ordinal");

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
