-- AlterTable
ALTER TABLE "GuildLeveling" ADD COLUMN     "enabledChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "enabledRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ignoredChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ignoredRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
