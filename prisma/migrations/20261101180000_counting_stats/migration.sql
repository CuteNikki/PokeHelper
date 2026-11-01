-- AlterTable
ALTER TABLE "GuildCounting" ADD COLUMN     "milestoneReactions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CountingRun" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedByUserId" TEXT,
    "finalNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountingEntry" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountingUser" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "counted" INTEGER NOT NULL DEFAULT 0,
    "mistakes" INTEGER NOT NULL DEFAULT 0,
    "lastCountedAt" TIMESTAMP(3),

    CONSTRAINT "CountingUser_pkey" PRIMARY KEY ("guildId","userId")
);

-- CreateIndex
CREATE INDEX "CountingRun_guildId_endedAt_idx" ON "CountingRun"("guildId", "endedAt");

-- CreateIndex
CREATE INDEX "CountingEntry_runId_number_idx" ON "CountingEntry"("runId", "number");

-- CreateIndex
CREATE INDEX "CountingUser_guildId_counted_idx" ON "CountingUser"("guildId", "counted");

-- AddForeignKey
ALTER TABLE "CountingRun" ADD CONSTRAINT "CountingRun_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildCounting"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountingEntry" ADD CONSTRAINT "CountingEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "CountingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountingUser" ADD CONSTRAINT "CountingUser_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildCounting"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;


-- Games already in progress get their ongoing run, with an unknown start as there's no history from before
INSERT INTO "CountingRun" ("guildId", "startedAt")
SELECT "guildId", NULL FROM "GuildCounting" WHERE "currentNumber" > 0;
