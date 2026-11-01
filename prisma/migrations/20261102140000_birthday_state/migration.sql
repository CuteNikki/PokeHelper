-- AlterTable
ALTER TABLE "UserBirthday" ADD COLUMN     "announcedYear" INTEGER,
ADD COLUMN     "roleActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roleYear" INTEGER;

