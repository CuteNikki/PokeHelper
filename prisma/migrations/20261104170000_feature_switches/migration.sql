-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "roleMenusEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tempVoiceEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "GuildCounting" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TempVoiceCreator" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

