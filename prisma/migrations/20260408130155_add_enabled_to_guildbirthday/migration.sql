-- AlterTable
ALTER TABLE "GuildBirthday" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "channelId" DROP NOT NULL;
