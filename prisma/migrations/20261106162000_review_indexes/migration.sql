-- CreateIndex
CREATE INDEX "CountingEntry_userId_idx" ON "CountingEntry"("userId");

-- CreateIndex
CREATE INDEX "CountingUser_userId_idx" ON "CountingUser"("userId");

-- CreateIndex
CREATE INDEX "CountingRun_endedByUserId_idx" ON "CountingRun"("endedByUserId");

-- CreateIndex
CREATE INDEX "UserLeveling_guildId_xp_idx" ON "UserLeveling"("guildId", "xp");

-- CreateIndex
CREATE INDEX "UserLeveling_userId_idx" ON "UserLeveling"("userId");

-- CreateIndex
CREATE INDEX "UserLevelingWeekly_guildId_xp_idx" ON "UserLevelingWeekly"("guildId", "xp");

-- CreateIndex
CREATE INDEX "UserLevelingWeekly_userId_idx" ON "UserLevelingWeekly"("userId");

-- CreateIndex
CREATE INDEX "UserLevelingMonthly_guildId_xp_idx" ON "UserLevelingMonthly"("guildId", "xp");

-- CreateIndex
CREATE INDEX "UserLevelingMonthly_userId_idx" ON "UserLevelingMonthly"("userId");

-- CreateIndex
CREATE INDEX "ReactionRoleMenu_messageId_idx" ON "ReactionRoleMenu"("messageId");
