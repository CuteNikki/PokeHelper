-- AlterTable
ALTER TABLE "GuildLeveling" ADD COLUMN     "weeklyResetMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "monthlyReward" TEXT,
ADD COLUMN     "monthlyLastResetAt" TIMESTAMP(3),
ADD COLUMN     "monthlyLastWinner" TEXT,
ADD COLUMN     "monthlyWinnerRole" TEXT,
ADD COLUMN     "monthlyResetMessages" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UserLevelingMonthly" (
    "xp" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLevelingMonthly_pkey" PRIMARY KEY ("guildId","userId")
);

-- AddForeignKey
ALTER TABLE "UserLevelingMonthly" ADD CONSTRAINT "UserLevelingMonthly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLevelingMonthly" ADD CONSTRAINT "UserLevelingMonthly_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;
