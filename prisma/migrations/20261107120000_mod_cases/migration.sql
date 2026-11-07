-- CreateEnum
CREATE TYPE "ModCaseType" AS ENUM ('warn', 'timeout', 'kick', 'ban', 'unban');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "caseCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ModCase" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "ModCaseType" NOT NULL,
    "userId" TEXT NOT NULL,
    "moderatorId" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModCase_guildId_userId_idx" ON "ModCase"("guildId", "userId");

-- CreateIndex
CREATE INDEX "ModCase_expiresAt_idx" ON "ModCase"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModCase_guildId_number_key" ON "ModCase"("guildId", "number");

-- AddForeignKey
ALTER TABLE "ModCase" ADD CONSTRAINT "ModCase_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
