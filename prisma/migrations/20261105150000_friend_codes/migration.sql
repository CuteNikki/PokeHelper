-- CreateTable
CREATE TABLE "UserFriendCodes" (
    "userId" TEXT NOT NULL,
    "nintendoSwitch" TEXT,
    "pokemonGo" TEXT,
    "pokemonSleep" TEXT,
    "tcgPocket" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFriendCodes_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserFriendCodes" ADD CONSTRAINT "UserFriendCodes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
