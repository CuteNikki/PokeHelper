-- CreateTable
CREATE TABLE "GuildLeveling" (
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "channelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildLeveling_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "GuildLevelingReward" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildLevelingReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLeveling" (
    "xp" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLeveling_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateIndex
CREATE INDEX "GuildLeveling_channelId_idx" ON "GuildLeveling"("channelId");

-- CreateIndex
CREATE INDEX "GuildLevelingReward_guildId_idx" ON "GuildLevelingReward"("guildId");

-- AddForeignKey
ALTER TABLE "GuildLeveling" ADD CONSTRAINT "GuildLeveling_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildLevelingReward" ADD CONSTRAINT "GuildLevelingReward_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildLeveling"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeveling" ADD CONSTRAINT "UserLeveling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLeveling" ADD CONSTRAINT "UserLeveling_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
