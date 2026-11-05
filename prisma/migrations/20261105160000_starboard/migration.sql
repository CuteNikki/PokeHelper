-- CreateTable
CREATE TABLE "GuildStarboard" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channelId" TEXT,
    "emoji" TEXT,
    "threshold" INTEGER,
    "ignoredChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildStarboard_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "StarboardEntry" (
    "messageId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "starboardMessageId" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarboardEntry_pkey" PRIMARY KEY ("messageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarboardEntry_starboardMessageId_key" ON "StarboardEntry"("starboardMessageId");

-- CreateIndex
CREATE INDEX "StarboardEntry_guildId_idx" ON "StarboardEntry"("guildId");

-- CreateIndex
CREATE INDEX "StarboardEntry_authorId_idx" ON "StarboardEntry"("authorId");

-- AddForeignKey
ALTER TABLE "GuildStarboard" ADD CONSTRAINT "GuildStarboard_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarboardEntry" ADD CONSTRAINT "StarboardEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
