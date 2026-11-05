-- Who starred, in place of a count. Messages starred before start from who reacted, the next time they're starred
ALTER TABLE "StarboardEntry" DROP COLUMN "stars",
ADD COLUMN     "starredBy" TEXT[] DEFAULT ARRAY[]::TEXT[];
