-- AlterTable
ALTER TABLE "GuildLeveling" ADD COLUMN     "weeklyLastResetAt" TIMESTAMP(3),
ADD COLUMN     "weeklyLastWinner" TEXT,
ADD COLUMN     "weeklyReward" TEXT;

-- CreateTable
CREATE TABLE "UserLevelingWeekly" (
    "xp" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLevelingWeekly_pkey" PRIMARY KEY ("guildId","userId")
);

-- AddForeignKey
ALTER TABLE "UserLevelingWeekly" ADD CONSTRAINT "UserLevelingWeekly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLevelingWeekly" ADD CONSTRAINT "UserLevelingWeekly_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
