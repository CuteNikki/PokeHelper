-- CreateEnum
CREATE TYPE "MultiplierTarget" AS ENUM ('channel', 'role');

-- CreateTable
CREATE TABLE "LevelingMultiplier" (
    "guildId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "MultiplierTarget" NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelingMultiplier_pkey" PRIMARY KEY ("guildId","targetId")
);

-- AddForeignKey
ALTER TABLE "LevelingMultiplier" ADD CONSTRAINT "LevelingMultiplier_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "GuildLeveling"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

