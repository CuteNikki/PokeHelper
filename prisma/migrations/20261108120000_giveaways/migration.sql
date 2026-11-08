-- CreateEnum
CREATE TYPE "GiveawayStatus" AS ENUM ('draft', 'active', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "GiveawayRoleKind" AS ENUM ('required', 'blocked', 'bonus');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "giveawayCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giveawaysEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER,
    "status" "GiveawayStatus" NOT NULL DEFAULT 'draft',
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "hostId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "prize" TEXT NOT NULL,
    "description" TEXT,
    "winnerCount" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "endsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "requireAllRoles" BOOLEAN NOT NULL DEFAULT false,
    "minLevel" INTEGER,
    "minMemberMinutes" INTEGER,
    "minAccountMinutes" INTEGER,
    "claimMinutes" INTEGER,
    "winnerRoleId" TEXT,
    "pingRoleId" TEXT,
    "dmWinners" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayRole" (
    "giveawayId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "kind" "GiveawayRoleKind" NOT NULL,
    "bonus" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GiveawayRole_pkey" PRIMARY KEY ("giveawayId","roleId")
);

-- CreateTable
CREATE TABLE "GiveawayEntry" (
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entries" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("giveawayId","userId")
);

-- CreateTable
CREATE TABLE "GiveawayWinner" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "userId" TEXT,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimBy" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),

    CONSTRAINT "GiveawayWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Giveaway_messageId_key" ON "Giveaway"("messageId");

-- CreateIndex
CREATE INDEX "Giveaway_guildId_status_idx" ON "Giveaway"("guildId", "status");

-- CreateIndex
CREATE INDEX "Giveaway_status_endsAt_idx" ON "Giveaway"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Giveaway_guildId_number_key" ON "Giveaway"("guildId", "number");

-- CreateIndex
CREATE INDEX "GiveawayRole_roleId_idx" ON "GiveawayRole"("roleId");

-- CreateIndex
CREATE INDEX "GiveawayEntry_giveawayId_entries_idx" ON "GiveawayEntry"("giveawayId", "entries");

-- CreateIndex
CREATE INDEX "GiveawayEntry_userId_idx" ON "GiveawayEntry"("userId");

-- CreateIndex
CREATE INDEX "GiveawayWinner_giveawayId_idx" ON "GiveawayWinner"("giveawayId");

-- CreateIndex
CREATE INDEX "GiveawayWinner_userId_idx" ON "GiveawayWinner"("userId");

-- CreateIndex
CREATE INDEX "GiveawayWinner_claimBy_idx" ON "GiveawayWinner"("claimBy");

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayRole" ADD CONSTRAINT "GiveawayRole_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayEntry" ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayWinner" ADD CONSTRAINT "GiveawayWinner_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

