-- AlterTable
ALTER TABLE "GuildCounting" ADD COLUMN     "livesLeft" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxLives" INTEGER,
ADD COLUMN     "regenerateLives" BOOLEAN NOT NULL DEFAULT false;

-- Reset on fail was the same as one life, and without it lives were unlimited
UPDATE "GuildCounting" SET "maxLives" = 1, "livesLeft" = 1 WHERE "resetOnFail" = true;

-- AlterTable
ALTER TABLE "GuildCounting" DROP COLUMN "resetOnFail";
