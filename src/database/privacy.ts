import { prisma } from 'database/index';
import { forgetGuild } from 'database/guild';
import { forgetUser } from 'database/user';

/**
 * Everything stored about a person and a server, to download it or delete it, as the privacy policy promises.
 * When a table gets a column with a user ID, it belongs here too.
 */

/** The temporary voice lists someone can be on. */
const VOICE_LISTS = ['allowed', 'blocked', 'moderators'] as const;
const onAList = (userId: string) => VOICE_LISTS.map((list) => ({ [list]: { has: userId } }));

/** Everything stored about someone, in every server. Others' data is left out, like who else is on a list they're on. */
export async function getUserData(userId: string) {
  const [
    user,
    birthdayRoles,
    counting,
    countedNumbers,
    runsEnded,
    countingRecords,
    weeklyWins,
    monthlyWins,
    voiceChannels,
    voiceSettings,
    onOthersSettings,
    starred,
    casesAbout,
    casesMade,
    giveawayEntries,
    giveawayWins,
    giveawaysSetUp,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { userId },
      include: { birthday: true, friendCodes: true, levels: true, levelsWeekly: true, levelsMonthly: true, reminders: true },
    }),
    prisma.birthdayRole.findMany({ where: { userId } }),
    prisma.countingUser.findMany({ where: { userId } }),
    prisma.countingEntry.findMany({
      where: { userId },
      select: { guildId: true, number: true, messageId: true, countedAt: true },
      orderBy: { countedAt: 'asc' },
    }),
    prisma.countingRun.findMany({ where: { endedByUserId: userId }, select: { guildId: true, finalNumber: true, endedAt: true } }),
    prisma.guildCounting.findMany({
      where: { OR: [{ highestNumberByUserId: userId }, { lastNumberByUserId: userId }] },
      select: { guildId: true, highestNumberByUserId: true, highestNumber: true, lastNumberByUserId: true, lastNumber: true },
    }),
    prisma.guildLeveling.findMany({ where: { weeklyLastWinner: userId }, select: { guildId: true, weeklyLastResetAt: true } }),
    prisma.guildLeveling.findMany({ where: { monthlyLastWinner: userId }, select: { guildId: true, monthlyLastResetAt: true } }),
    prisma.tempVoiceChannel.findMany({ where: { OR: [{ ownerId: userId }, ...onAList(userId)] } }),
    prisma.tempVoiceSettings.findMany({ where: { userId } }),
    prisma.tempVoiceSettings.findMany({ where: { userId: { not: userId }, OR: onAList(userId) } }),
    prisma.starboardEntry.findMany({ where: { OR: [{ authorId: userId }, { starredBy: { has: userId } }] } }),
    prisma.modCase.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.modCase.findMany({
      where: { moderatorId: userId, userId: { not: userId } },
      select: { guildId: true, number: true, type: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.giveawayEntry.findMany({
      where: { userId },
      select: { entries: true, createdAt: true, giveaway: { select: { guildId: true, number: true, prize: true, status: true, endedAt: true } } },
    }),
    prisma.giveawayWinner.findMany({
      where: { userId },
      select: {
        drawnAt: true,
        prize: true,
        claimBy: true,
        claimedAt: true,
        replacedAt: true,
        giveaway: { select: { guildId: true, number: true, prize: true, status: true, endedAt: true } },
      },
    }),
    prisma.giveaway.findMany({ where: { hostId: userId }, select: { guildId: true, number: true, prize: true, status: true, createdAt: true } }),
  ]);

  return {
    userId,
    leveling: { allTime: user?.levels ?? [], weekly: user?.levelsWeekly ?? [], monthly: user?.levelsMonthly ?? [], weeklyWins, monthlyWins },
    birthday: user?.birthday ?? null,
    friendCodes: user?.friendCodes ?? null,
    reminders: { timezone: user?.reminderTimezone ?? null, list: user?.reminders ?? [] },
    birthdayRoles,
    moderation: {
      // Cases about them, with why, but the moderator only as redacted, as who that is is about someone else
      cases: casesAbout.map((modCase) => ({
        ...modCase,
        moderatorId: modCase.moderatorId && modCase.moderatorId !== userId ? 'redacted' : modCase.moderatorId,
      })),
      // Cases they made as a moderator, without who they were about or why, which is about someone else
      made: casesMade,
    },
    giveaways: {
      // Without who else entered or won, which is about someone else
      entries: giveawayEntries,
      wins: giveawayWins,
      setUp: giveawaysSetUp,
    },
    starboard: {
      // Their messages that were starred, with who starred them. What they said is in the posts on Discord, not stored here
      starred: starred.filter((entry) => entry.authorId === userId),
      // Others' messages they starred, without who else did
      gaveStars: starred
        .filter((entry) => entry.authorId !== userId)
        .map((entry) => ({ guildId: entry.guildId, channelId: entry.channelId, messageId: entry.messageId })),
    },
    counting: {
      stats: counting,
      numbers: countedNumbers,
      runsEnded,
      // Only what's theirs: the record or the last number, when they counted it
      records: countingRecords.map((record) => ({
        guildId: record.guildId,
        highestNumber: record.highestNumberByUserId === userId ? record.highestNumber : null,
        lastNumber: record.lastNumberByUserId === userId ? record.lastNumber : null,
      })),
    },
    tempVoice: {
      // Channels they own in full, and for others' channels only which lists they're on
      channels: voiceChannels.map((channel) =>
        channel.ownerId === userId
          ? channel
          : { channelId: channel.channelId, guildId: channel.guildId, on: VOICE_LISTS.filter((list) => channel[list].includes(userId)) },
      ),
      savedSettings: voiceSettings,
      onOthersSavedSettings: onOthersSettings.map((settings) => ({
        guildId: settings.guildId,
        on: VOICE_LISTS.filter((list) => settings[list].includes(userId)),
      })),
    },
  };
}

/**
 * Delete everything stored about someone, in every server. Where they're named in a server's data, like as who holds the counting
 * record, their ID is taken out and the rest stays. Channels they own right now stay theirs until they're deleted, as they're in use.
 * Moderation cases stay, about them and made by them, as they're the server's records, which they can't be allowed to wipe. So do
 * giveaways they started, which are the server's too, while their drafts go. They're taken out of giveaways they entered, and as winners
 * only their ID goes, so a giveaway still shows how many won.
 */
export async function deleteUserData(userId: string) {
  const without = (ids: string[]) => ids.filter((id) => id !== userId);

  await prisma.$transaction(async (tx) => {
    // Levels, weekly and monthly levels, the birthday and friend codes go with the user
    await tx.user.deleteMany({ where: { userId } });
    await tx.birthdayRole.deleteMany({ where: { userId } });
    await tx.countingUser.deleteMany({ where: { userId } });
    await tx.countingEntry.deleteMany({ where: { userId } });
    await tx.countingRun.updateMany({ where: { endedByUserId: userId }, data: { endedByUserId: null } });
    await tx.guildCounting.updateMany({ where: { highestNumberByUserId: userId }, data: { highestNumberByUserId: null } });
    await tx.guildCounting.updateMany({ where: { lastNumberByUserId: userId }, data: { lastNumberByUserId: null } });
    await tx.guildLeveling.updateMany({ where: { weeklyLastWinner: userId }, data: { weeklyLastWinner: null } });
    await tx.guildLeveling.updateMany({ where: { monthlyLastWinner: userId }, data: { monthlyLastWinner: null } });
    await tx.tempVoiceSettings.deleteMany({ where: { userId } });
    await tx.giveawayEntry.deleteMany({ where: { userId } });
    // A prize they still had to claim wasn't theirs yet, so its time to claim ends now, and the claim job gives it to someone else
    await tx.giveawayWinner.updateMany({
      where: { userId, claimBy: { not: null }, claimedAt: null, replacedAt: null },
      data: { userId: null, claimBy: new Date() },
    });
    // Other wins stay, so the giveaway still shows how many won
    await tx.giveawayWinner.updateMany({ where: { userId }, data: { userId: null, claimBy: null } });
    await tx.giveaway.deleteMany({ where: { hostId: userId, status: 'draft' } });
    // Forgotten, so their posts aren't updated anymore. The posts are messages in the server, which its moderators can delete
    await tx.starboardEntry.deleteMany({ where: { authorId: userId } });
    // Their stars on others' messages are taken back. The counts on the posts change with the next star
    for (const entry of await tx.starboardEntry.findMany({ where: { starredBy: { has: userId } } })) {
      await tx.starboardEntry.update({ where: { messageId: entry.messageId }, data: { starredBy: without(entry.starredBy) } });
    }

    // Taken off the lists of others
    for (const settings of await tx.tempVoiceSettings.findMany({ where: { OR: onAList(userId) } })) {
      await tx.tempVoiceSettings.update({
        where: { guildId_userId: { guildId: settings.guildId, userId: settings.userId } },
        data: { allowed: without(settings.allowed), blocked: without(settings.blocked), moderators: without(settings.moderators) },
      });
    }
    for (const channel of await tx.tempVoiceChannel.findMany({ where: { ownerId: { not: userId }, OR: onAList(userId) } })) {
      await tx.tempVoiceChannel.update({
        where: { channelId: channel.channelId },
        data: { allowed: without(channel.allowed), blocked: without(channel.blocked), moderators: without(channel.moderators) },
      });
    }
  });
  forgetUser(userId);
}

/** Everything stored about a server: its settings, its members' levels and counting stats, its moderation cases and its giveaways. The numbers of each counting run are left out, as there can be many. */
export const getGuildData = (guildId: string) =>
  prisma.guild.findUnique({
    where: { guildId },
    include: {
      counting: { include: { runs: true, users: true } },
      birthday: true,
      birthdayRoles: true,
      leveling: { include: { rewards: true, multipliers: true } },
      levels: true,
      levelsWeekly: true,
      levelsMonthly: true,
      logs: true,
      starboard: true,
      starboardEntries: true,
      stickyMessages: true,
      modCases: true,
      giveaways: { include: { roles: true, entries: true, winners: true } },
      reactionRoleMenus: { include: { roles: true } },
      tempVoiceCreators: true,
      tempVoiceChannels: true,
      tempVoiceSettings: true,
    },
  });

/** Delete everything stored about a server, as if the bot was just added. Everything else belongs to it and goes with it. */
export async function deleteGuildData(guildId: string) {
  await prisma.guild.deleteMany({ where: { guildId } });
  forgetGuild(guildId);
}

/** A role the bot gave someone and takes away again later, like a birthday or winner role. */
export interface GivenRole {
  guildId: string;
  userId: string;
  roleId: string;
}

/**
 * The roles the bot gave and would take away later, for someone in every server or for everyone in a server.
 * Deleting the data they're remembered by would leave them on for good, so they're taken away first.
 */
export async function getGivenRoles(where: { userId: string } | { guildId: string }): Promise<GivenRole[]> {
  const winnerOf = 'userId' in where ? { OR: [{ weeklyLastWinner: where.userId }, { monthlyLastWinner: where.userId }] } : { guildId: where.guildId };
  const [birthdayRoles, leveling] = await Promise.all([prisma.birthdayRole.findMany({ where }), prisma.guildLeveling.findMany({ where: winnerOf })]);

  const winners = leveling.flatMap((config) =>
    [
      // The role they got, or for winners from before that was remembered, the one set now
      { userId: config.weeklyLastWinner, roleId: config.weeklyWinnerRole ?? config.weeklyReward },
      { userId: config.monthlyLastWinner, roleId: config.monthlyWinnerRole ?? config.monthlyReward },
    ]
      .filter((winner): winner is { userId: string; roleId: string } => winner.userId !== null && winner.roleId !== null)
      .filter((winner) => !('userId' in where) || winner.userId === where.userId)
      .map((winner) => ({ guildId: config.guildId, ...winner })),
  );
  return [...birthdayRoles.map(({ guildId, userId, roleId }) => ({ guildId, userId, roleId })), ...winners];
}
