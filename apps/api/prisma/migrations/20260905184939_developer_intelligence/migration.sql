-- CreateEnum
CREATE TYPE "AiRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('GENERAL', 'PROJECT', 'TROUBLESHOOTING', 'DOCUMENTATION', 'CODE', 'INFRASTRUCTURE', 'KNOWLEDGE');

-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('OLLAMA');

-- CreateEnum
CREATE TYPE "AiRequestStatus" AS ENUM ('OK', 'ERROR', 'CANCELLED');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "mode" "AiMode" NOT NULL DEFAULT 'GENERAL',
    "provider" "AiProviderKind" NOT NULL DEFAULT 'OLLAMA',
    "model" TEXT NOT NULL,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "attached" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "AiRole" NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "model" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "durationMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "AiProviderKind" NOT NULL DEFAULT 'OLLAMA',
    "model" TEXT NOT NULL,
    "mode" "AiMode" NOT NULL DEFAULT 'GENERAL',
    "temperature" DOUBLE PRECISION,
    "topP" DOUBLE PRECISION,
    "topK" INTEGER,
    "contextLength" INTEGER,
    "systemPrompt" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_model_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "userId" UUID NOT NULL,
    "provider" "AiProviderKind" NOT NULL DEFAULT 'OLLAMA',
    "baseUrl" TEXT,
    "chatModel" TEXT,
    "embeddingModel" TEXT,
    "defaultMode" "AiMode" NOT NULL DEFAULT 'GENERAL',
    "temperature" DOUBLE PRECISION,
    "privateMode" BOOLEAN NOT NULL DEFAULT true,
    "retainMessages" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conversationId" UUID,
    "messageId" UUID,
    "provider" "AiProviderKind" NOT NULL DEFAULT 'OLLAMA',
    "model" TEXT NOT NULL,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'OK',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_userId_updatedAt_idx" ON "ai_conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_isArchived_updatedAt_idx" ON "ai_conversations"("userId", "isArchived", "updatedAt");

-- CreateIndex
CREATE INDEX "ai_conversations_projectId_idx" ON "ai_conversations"("projectId");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_createdAt_idx" ON "ai_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_model_profiles_userId_idx" ON "ai_model_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_profiles_userId_name_key" ON "ai_model_profiles"("userId", "name");

-- CreateIndex
CREATE INDEX "ai_usage_userId_startedAt_idx" ON "ai_usage"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ai_usage_conversationId_idx" ON "ai_usage"("conversationId");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_profiles" ADD CONSTRAINT "ai_model_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
