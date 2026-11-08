-- AlterTable
ALTER TABLE "GiveawayWinner" ADD COLUMN     "prize" TEXT;

-- CreateTable
CREATE TABLE "GiveawayPrize" (
    "giveawayId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "GiveawayPrize_pkey" PRIMARY KEY ("giveawayId","position")
);

-- AddForeignKey
ALTER TABLE "GiveawayPrize" ADD CONSTRAINT "GiveawayPrize_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

