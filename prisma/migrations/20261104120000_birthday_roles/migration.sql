-- CreateTable
CREATE TABLE "BirthdayRole" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirthdayRole_pkey" PRIMARY KEY ("guildId","userId")
);

-- AddForeignKey
ALTER TABLE "BirthdayRole" ADD CONSTRAINT "BirthdayRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

