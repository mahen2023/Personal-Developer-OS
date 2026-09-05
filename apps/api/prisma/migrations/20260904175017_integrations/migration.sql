-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GITHUB', 'GITLAB', 'CLOUDFLARE');

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "account" TEXT,
    "token" BYTEA NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_userId_provider_key" ON "integrations"("userId", "provider");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
