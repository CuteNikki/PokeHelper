-- CreateTable
CREATE TABLE "StickyMessage" (
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickyMessage_pkey" PRIMARY KEY ("channelId")
);

-- CreateIndex
CREATE INDEX "StickyMessage_guildId_idx" ON "StickyMessage"("guildId");

-- AddForeignKey
ALTER TABLE "StickyMessage" ADD CONSTRAINT "StickyMessage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
