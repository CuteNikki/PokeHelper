-- AlterTable
ALTER TABLE "TempVoiceChannel" ADD COLUMN     "moderators" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TempVoiceSettings" ADD COLUMN     "moderators" TEXT[] DEFAULT ARRAY[]::TEXT[];

