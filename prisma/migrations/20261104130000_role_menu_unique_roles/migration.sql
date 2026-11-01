-- Keep only the oldest of roles that were added to a menu twice, as two buttons with the same role break the menu
DELETE FROM "ReactionRole" a
USING "ReactionRole" b
WHERE a."menuId" = b."menuId" AND a."roleId" = b."roleId" AND (a."createdAt", a."id") > (b."createdAt", b."id");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRole_menuId_roleId_key" ON "ReactionRole"("menuId", "roleId");
