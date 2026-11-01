-- AlterTable
ALTER TABLE "ReactionRoleMenu" ADD COLUMN     "description" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "messageId" DROP NOT NULL;
