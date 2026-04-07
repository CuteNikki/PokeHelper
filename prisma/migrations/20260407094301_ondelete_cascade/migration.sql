-- DropForeignKey
ALTER TABLE "GuildBirthday" DROP CONSTRAINT "GuildBirthday_guildId_fkey";

-- DropForeignKey
ALTER TABLE "GuildCounting" DROP CONSTRAINT "GuildCounting_guildId_fkey";

-- DropForeignKey
ALTER TABLE "UserBirthday" DROP CONSTRAINT "UserBirthday_userId_fkey";

-- CreateTable
CREATE TABLE "ReactionRoleMenu" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "guildId" TEXT NOT NULL,

    CONSTRAINT "ReactionRoleMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRole" (
    "id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReactionRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReactionRoleMenu_guildId_idx" ON "ReactionRoleMenu"("guildId");

-- CreateIndex
CREATE INDEX "ReactionRole_menuId_idx" ON "ReactionRole"("menuId");

-- AddForeignKey
ALTER TABLE "UserBirthday" ADD CONSTRAINT "UserBirthday_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildBirthday" ADD CONSTRAINT "GuildBirthday_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildCounting" ADD CONSTRAINT "GuildCounting_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRoleMenu" ADD CONSTRAINT "ReactionRoleMenu_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReactionRole" ADD CONSTRAINT "ReactionRole_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "ReactionRoleMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
