-- AlterTable
ALTER TABLE "StarboardEntry" ADD COLUMN     "starboardChannelId" TEXT;

-- Posts so far are in the starboard channel set now
UPDATE "StarboardEntry" AS e SET "starboardChannelId" = g."channelId"
FROM "GuildStarboard" AS g
WHERE e."guildId" = g."guildId" AND e."starboardMessageId" IS NOT NULL;
