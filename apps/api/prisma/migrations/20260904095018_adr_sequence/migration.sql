-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adrSequence" INTEGER NOT NULL DEFAULT 0;

-- Backfill: start each user's counter above the highest number they already
-- have, so the first ADR created after this migration cannot collide with an
-- existing one (users.adrSequence is the sole source of ADR numbers from here).
UPDATE "users" u
SET "adrSequence" = COALESCE((SELECT MAX(a."number") FROM "adrs" a WHERE a."userId" = u."id"), 0);
