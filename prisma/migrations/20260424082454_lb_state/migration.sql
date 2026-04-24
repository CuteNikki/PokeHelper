-- CreateEnum
CREATE TYPE "SortOrder" AS ENUM ('asc', 'desc');

-- CreateTable
CREATE TABLE "LeaderboardState" (
    "messageId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" "SortOrder" NOT NULL DEFAULT 'desc',
    "weekly" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardState_pkey" PRIMARY KEY ("messageId")
);
