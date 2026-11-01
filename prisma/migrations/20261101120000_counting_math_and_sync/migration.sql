-- AlterTable
ALTER TABLE "GuildCounting" ADD COLUMN     "allowMath" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastCheckedMessageId" TEXT;

-- Syncing continues from the last checked message, which for existing games is the last counted one
UPDATE "GuildCounting" SET "lastCheckedMessageId" = "currentNumberMessageId";
