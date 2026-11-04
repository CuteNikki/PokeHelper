-- CreateTable
CREATE TABLE "GuildLogs" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "messagesChannelId" TEXT,
    "membersChannelId" TEXT,
    "moderationChannelId" TEXT,
    "serverChannelId" TEXT,
    "voiceChannelId" TEXT,
    "disabledEvents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ignoredRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildLogs_pkey" PRIMARY KEY ("guildId")
);

-- AddForeignKey
ALTER TABLE "GuildLogs" ADD CONSTRAINT "GuildLogs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

