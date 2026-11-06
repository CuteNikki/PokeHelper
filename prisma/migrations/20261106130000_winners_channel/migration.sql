-- AlterTable
ALTER TABLE "GuildLeveling" ADD COLUMN     "winnersChannelId" TEXT;

-- Servers that announced winners in the level up channel keep doing so
UPDATE "GuildLeveling" SET "winnersChannelId" = "channelId";
