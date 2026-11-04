-- CreateTable
CREATE TABLE "TempVoiceCreator" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "namePrefix" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "guildId" TEXT NOT NULL,

    CONSTRAINT "TempVoiceCreator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TempVoiceChannel" (
    "channelId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "panelMessageId" TEXT,
    "namePrefix" TEXT NOT NULL DEFAULT '',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "allowed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blocked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guildId" TEXT NOT NULL,
    "creatorId" TEXT,

    CONSTRAINT "TempVoiceChannel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "TempVoiceSettings" (
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "userLimit" INTEGER NOT NULL DEFAULT 0,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "allowed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blocked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "guildId" TEXT NOT NULL,

    CONSTRAINT "TempVoiceSettings_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TempVoiceCreator_channelId_key" ON "TempVoiceCreator"("channelId");

-- CreateIndex
CREATE INDEX "TempVoiceCreator_guildId_idx" ON "TempVoiceCreator"("guildId");

-- CreateIndex
CREATE INDEX "TempVoiceChannel_guildId_ownerId_idx" ON "TempVoiceChannel"("guildId", "ownerId");

-- AddForeignKey
ALTER TABLE "TempVoiceCreator" ADD CONSTRAINT "TempVoiceCreator_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempVoiceChannel" ADD CONSTRAINT "TempVoiceChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempVoiceChannel" ADD CONSTRAINT "TempVoiceChannel_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "TempVoiceCreator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TempVoiceSettings" ADD CONSTRAINT "TempVoiceSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

