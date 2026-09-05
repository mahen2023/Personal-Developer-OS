-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PROJECT', 'REPOSITORY', 'ENVIRONMENT', 'SERVER', 'DATABASE', 'DOMAIN', 'SSL_CERTIFICATE', 'DEPLOYMENT', 'NOTE', 'TASK', 'ISSUE', 'SOLUTION', 'SNIPPET', 'COMMAND', 'ADR', 'MEETING', 'DOCUMENT', 'BOOKMARK', 'LEARNING', 'IDEA', 'VAULT_ITEM');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'BLOCKED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('GENERAL', 'TECHNICAL', 'MEETING', 'IDEA', 'RESEARCH', 'TROUBLESHOOTING', 'DOCUMENTATION', 'PERSONAL');

-- CreateEnum
CREATE TYPE "RepoProvider" AS ENUM ('GITHUB', 'GITLAB', 'BITBUCKET', 'AZURE_DEVOPS', 'OTHER');

-- CreateEnum
CREATE TYPE "ServerProvider" AS ENUM ('GCP', 'AWS', 'AZURE', 'DIGITALOCEAN', 'HETZNER', 'LOCAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'UNKNOWN', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "DatabaseType" AS ENUM ('POSTGRESQL', 'MONGODB', 'MYSQL', 'REDIS', 'SQLITE', 'OTHER');

-- CreateEnum
CREATE TYPE "EnvironmentType" AS ENUM ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'TESTING', 'LOCAL');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('IN_PROGRESS', 'SUCCESS', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "AdrStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('WANT_TO_LEARN', 'LEARNING', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LearningKind" AS ENUM ('COURSE', 'ARTICLE', 'BOOK', 'VIDEO', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('IDEA', 'RESEARCHING', 'PLANNED', 'BUILDING', 'COMPLETED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "BookmarkCategory" AS ENUM ('DOCUMENTATION', 'TUTORIAL', 'TOOL', 'REFERENCE', 'GITHUB', 'CLOUD', 'AI', 'DATABASE', 'DEVOPS', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "DangerLevel" AS ENUM ('SAFE', 'CAUTION', 'HIGH', 'DESTRUCTIVE');

-- CreateEnum
CREATE TYPE "CommandPlatform" AS ENUM ('LINUX', 'MACOS', 'WINDOWS', 'DOCKER', 'KUBERNETES', 'ANY');

-- CreateEnum
CREATE TYPE "VaultItemType" AS ENUM ('PASSWORD', 'API_KEY', 'SSH_KEY', 'TOTP', 'TOKEN', 'CREDENTIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DOMAIN_EXPIRY', 'SSL_EXPIRY', 'TASK_DUE', 'TASK_OVERDUE', 'PROJECT_DEADLINE', 'SECRET_ROTATION', 'BACKUP_REMINDER', 'DEPLOYMENT_FAILED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_REVOKED', 'PASSWORD_CHANGED', 'VAULT_UNLOCKED', 'VAULT_LOCKED', 'VAULT_MASTER_CHANGED', 'SECRET_CREATED', 'SECRET_VIEWED', 'SECRET_UPDATED', 'SECRET_DELETED', 'SECRET_EXPORTED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "client" TEXT,
    "color" TEXT,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "techStack" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "progress" INTEGER NOT NULL DEFAULT 0,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "provider" "RepoProvider" NOT NULL DEFAULT 'GITHUB',
    "url" TEXT NOT NULL,
    "localPath" TEXT,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "language" TEXT,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "type" "EnvironmentType" NOT NULL DEFAULT 'DEVELOPMENT',
    "baseUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "env_variables" (
    "id" UUID NOT NULL,
    "environmentId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "vaultItemId" UUID,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "env_variables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "environmentId" UUID,
    "name" TEXT NOT NULL,
    "provider" "ServerProvider" NOT NULL DEFAULT 'OTHER',
    "ipAddress" TEXT,
    "hostname" TEXT,
    "os" TEXT,
    "cpuCores" INTEGER,
    "ramGb" INTEGER,
    "diskGb" INTEGER,
    "region" TEXT,
    "sshUsername" TEXT,
    "sshPort" INTEGER DEFAULT 22,
    "sshKeyId" UUID,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ServerStatus" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "databases" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "environmentId" UUID,
    "serverId" UUID,
    "name" TEXT NOT NULL,
    "type" "DatabaseType" NOT NULL DEFAULT 'POSTGRESQL',
    "host" TEXT,
    "port" INTEGER,
    "databaseName" TEXT,
    "username" TEXT,
    "credentialId" UUID,
    "version" TEXT,
    "sizeMb" INTEGER,
    "backupSchedule" TEXT,
    "lastBackupAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "environmentId" UUID,
    "name" TEXT NOT NULL,
    "registrar" TEXT,
    "dnsProvider" TEXT,
    "expiresAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssl_certificates" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "environmentId" UUID,
    "domainId" UUID,
    "commonName" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ssl_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "repositoryId" UUID,
    "environmentId" UUID,
    "serverId" UUID,
    "version" TEXT,
    "commitSha" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "deployedBy" TEXT,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationSec" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "type" "NoteType" NOT NULL DEFAULT 'GENERAL',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assignee" TEXT,
    "orderKey" INTEGER NOT NULL DEFAULT 0,
    "meetingId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "errorMessage" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "solutionId" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solutions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "repositoryId" UUID,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "errorMessage" TEXT,
    "environment" TEXT,
    "rootCause" TEXT,
    "solution" TEXT NOT NULL,
    "commands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snippets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'typescript',
    "code" TEXT NOT NULL,
    "description" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "snippets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commands" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "platform" "CommandPlatform" NOT NULL DEFAULT 'ANY',
    "dangerLevel" "DangerLevel" NOT NULL DEFAULT 'SAFE',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adrs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" "AdrStatus" NOT NULL DEFAULT 'PROPOSED',
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "alternatives" TEXT,
    "consequences" TEXT,
    "supersededBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discussion" TEXT,
    "decisions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "ownerType" "EntityType" NOT NULL DEFAULT 'PROJECT',
    "ownerId" UUID,
    "extractedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "category" "BookmarkCategory" NOT NULL DEFAULT 'OTHER',
    "favicon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "technology" TEXT,
    "kind" "LearningKind" NOT NULL DEFAULT 'COURSE',
    "url" TEXT,
    "status" "LearningStatus" NOT NULL DEFAULT 'WANT_TO_LEARN',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideas" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "status" "IdeaStatus" NOT NULL DEFAULT 'IDEA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kdf" TEXT NOT NULL DEFAULT 'argon2id',
    "kdfSalt" BYTEA NOT NULL,
    "kdfMemoryKib" INTEGER NOT NULL DEFAULT 65536,
    "kdfIterations" INTEGER NOT NULL DEFAULT 3,
    "kdfParallelism" INTEGER NOT NULL DEFAULT 4,
    "verifier" BYTEA NOT NULL,
    "wrappedDataKey" BYTEA NOT NULL,
    "wrapNonce" BYTEA NOT NULL,
    "autoLockMin" INTEGER NOT NULL DEFAULT 15,
    "clipboardSec" INTEGER NOT NULL DEFAULT 20,
    "lastUnlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "name" TEXT NOT NULL,
    "type" "VaultItemType" NOT NULL DEFAULT 'PASSWORD',
    "username" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "cipher" BYTEA NOT NULL,
    "nonce" BYTEA NOT NULL,
    "alg" TEXT NOT NULL DEFAULT 'aes-256-gcm',
    "totpDigits" INTEGER,
    "totpPeriod" INTEGER,
    "rotateEveryD" INTEGER,
    "lastRotatedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_tags" (
    "tagId" UUID NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_tags_pkey" PRIMARY KEY ("tagId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "entity_links" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromType" "EntityType" NOT NULL,
    "fromId" UUID NOT NULL,
    "toType" "EntityType" NOT NULL,
    "toId" UUID NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID,
    "action" TEXT NOT NULL,
    "entityType" "EntityType",
    "entityId" UUID,
    "summary" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" "EntityType",
    "entityId" UUID,
    "dueAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" "EntityType",
    "entityId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "projects_userId_status_idx" ON "projects"("userId", "status");

-- CreateIndex
CREATE INDEX "projects_userId_updatedAt_idx" ON "projects"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "projects_targetDate_idx" ON "projects"("targetDate");

-- CreateIndex
CREATE UNIQUE INDEX "projects_userId_slug_key" ON "projects"("userId", "slug");

-- CreateIndex
CREATE INDEX "repositories_userId_idx" ON "repositories"("userId");

-- CreateIndex
CREATE INDEX "repositories_projectId_idx" ON "repositories"("projectId");

-- CreateIndex
CREATE INDEX "environments_userId_idx" ON "environments"("userId");

-- CreateIndex
CREATE INDEX "environments_projectId_type_idx" ON "environments"("projectId", "type");

-- CreateIndex
CREATE INDEX "env_variables_vaultItemId_idx" ON "env_variables"("vaultItemId");

-- CreateIndex
CREATE UNIQUE INDEX "env_variables_environmentId_key_key" ON "env_variables"("environmentId", "key");

-- CreateIndex
CREATE INDEX "servers_userId_status_idx" ON "servers"("userId", "status");

-- CreateIndex
CREATE INDEX "servers_projectId_idx" ON "servers"("projectId");

-- CreateIndex
CREATE INDEX "servers_environmentId_idx" ON "servers"("environmentId");

-- CreateIndex
CREATE INDEX "databases_userId_idx" ON "databases"("userId");

-- CreateIndex
CREATE INDEX "databases_projectId_idx" ON "databases"("projectId");

-- CreateIndex
CREATE INDEX "databases_environmentId_idx" ON "databases"("environmentId");

-- CreateIndex
CREATE INDEX "domains_userId_idx" ON "domains"("userId");

-- CreateIndex
CREATE INDEX "domains_projectId_idx" ON "domains"("projectId");

-- CreateIndex
CREATE INDEX "domains_expiresAt_idx" ON "domains"("expiresAt");

-- CreateIndex
CREATE INDEX "ssl_certificates_userId_idx" ON "ssl_certificates"("userId");

-- CreateIndex
CREATE INDEX "ssl_certificates_expiresAt_idx" ON "ssl_certificates"("expiresAt");

-- CreateIndex
CREATE INDEX "ssl_certificates_domainId_idx" ON "ssl_certificates"("domainId");

-- CreateIndex
CREATE INDEX "deployments_userId_deployedAt_idx" ON "deployments"("userId", "deployedAt");

-- CreateIndex
CREATE INDEX "deployments_projectId_deployedAt_idx" ON "deployments"("projectId", "deployedAt");

-- CreateIndex
CREATE INDEX "deployments_status_idx" ON "deployments"("status");

-- CreateIndex
CREATE INDEX "notes_userId_updatedAt_idx" ON "notes"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "notes_projectId_idx" ON "notes"("projectId");

-- CreateIndex
CREATE INDEX "notes_type_idx" ON "notes"("type");

-- CreateIndex
CREATE INDEX "tasks_userId_status_idx" ON "tasks"("userId", "status");

-- CreateIndex
CREATE INDEX "tasks_projectId_status_idx" ON "tasks"("projectId", "status");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "issues_userId_status_idx" ON "issues"("userId", "status");

-- CreateIndex
CREATE INDEX "issues_projectId_idx" ON "issues"("projectId");

-- CreateIndex
CREATE INDEX "solutions_userId_updatedAt_idx" ON "solutions"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "solutions_projectId_idx" ON "solutions"("projectId");

-- CreateIndex
CREATE INDEX "snippets_userId_updatedAt_idx" ON "snippets"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "snippets_projectId_idx" ON "snippets"("projectId");

-- CreateIndex
CREATE INDEX "snippets_language_idx" ON "snippets"("language");

-- CreateIndex
CREATE INDEX "commands_userId_idx" ON "commands"("userId");

-- CreateIndex
CREATE INDEX "commands_projectId_idx" ON "commands"("projectId");

-- CreateIndex
CREATE INDEX "commands_category_idx" ON "commands"("category");

-- CreateIndex
CREATE INDEX "adrs_projectId_idx" ON "adrs"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "adrs_userId_number_key" ON "adrs"("userId", "number");

-- CreateIndex
CREATE INDEX "meetings_userId_meetingDate_idx" ON "meetings"("userId", "meetingDate");

-- CreateIndex
CREATE INDEX "meetings_projectId_idx" ON "meetings"("projectId");

-- CreateIndex
CREATE INDEX "documents_userId_createdAt_idx" ON "documents"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_projectId_idx" ON "documents"("projectId");

-- CreateIndex
CREATE INDEX "documents_ownerType_ownerId_idx" ON "documents"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "bookmarks_userId_category_idx" ON "bookmarks"("userId", "category");

-- CreateIndex
CREATE INDEX "bookmarks_projectId_idx" ON "bookmarks"("projectId");

-- CreateIndex
CREATE INDEX "learning_items_userId_status_idx" ON "learning_items"("userId", "status");

-- CreateIndex
CREATE INDEX "ideas_userId_status_idx" ON "ideas"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vault_profiles_userId_key" ON "vault_profiles"("userId");

-- CreateIndex
CREATE INDEX "vault_items_userId_type_idx" ON "vault_items"("userId", "type");

-- CreateIndex
CREATE INDEX "vault_items_projectId_idx" ON "vault_items"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_userId_slug_key" ON "tags"("userId", "slug");

-- CreateIndex
CREATE INDEX "entity_tags_entityType_entityId_idx" ON "entity_tags"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "entity_links_userId_idx" ON "entity_links"("userId");

-- CreateIndex
CREATE INDEX "entity_links_toType_toId_idx" ON "entity_links"("toType", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "entity_links_fromType_fromId_toType_toId_key" ON "entity_links"("fromType", "fromId", "toType", "toId");

-- CreateIndex
CREATE INDEX "activities_userId_createdAt_idx" ON "activities"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_projectId_createdAt_idx" ON "activities"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_entityType_entityId_idx" ON "activities"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_dueAt_idx" ON "notifications"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_variables" ADD CONSTRAINT "env_variables_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "env_variables" ADD CONSTRAINT "env_variables_vaultItemId_fkey" FOREIGN KEY ("vaultItemId") REFERENCES "vault_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_sshKeyId_fkey" FOREIGN KEY ("sshKeyId") REFERENCES "vault_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "databases" ADD CONSTRAINT "databases_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "vault_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_solutionId_fkey" FOREIGN KEY ("solutionId") REFERENCES "solutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solutions" ADD CONSTRAINT "solutions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adrs" ADD CONSTRAINT "adrs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adrs" ADD CONSTRAINT "adrs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_items" ADD CONSTRAINT "learning_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_profiles" ADD CONSTRAINT "vault_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
