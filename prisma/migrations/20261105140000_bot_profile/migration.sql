-- CreateTable
CREATE TABLE "BotProfile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "avatarTheme" TEXT,
    "bannerTheme" TEXT,
    "override" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotProfile_pkey" PRIMARY KEY ("id")
);

