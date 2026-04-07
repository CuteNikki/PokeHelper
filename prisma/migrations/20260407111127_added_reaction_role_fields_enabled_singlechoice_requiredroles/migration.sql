-- AlterTable
ALTER TABLE "ReactionRoleMenu" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requiredRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "singleChoice" BOOLEAN NOT NULL DEFAULT false;
