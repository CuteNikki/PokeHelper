-- RenameColumn
ALTER TABLE "GuildLeveling" RENAME COLUMN "channelId" TO "levelUpChannelId";

-- RenameIndex
ALTER INDEX "GuildLeveling_channelId_idx" RENAME TO "GuildLeveling_levelUpChannelId_idx";
