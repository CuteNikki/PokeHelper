import { prisma } from 'database/index';

/**
 * Everything stored about a person and a server, to download it or delete it, as the privacy policy promises.
 * When a table gets a column with a user ID, it belongs here too.
 */

/** The temporary voice lists someone can be on. */
const VOICE_LISTS = ['allowed', 'blocked', 'moderators'] as const;
const onAList = (userId: string) => VOICE_LISTS.map((list) => ({ [list]: { has: userId } }));

/** Everything stored about someone, in every server. Others' data is left out, like who else is on a list they're on. */
export async function getUserData(userId: string) {
  const [user, birthdayRoles, counting, countedNumbers, runsEnded, countingRecords, weeklyWins, voiceChannels, voiceSettings, onOthersSettings, starred] =
    await Promise.all([
      prisma.user.findUnique({ where: { userId }, include: { birthday: true, friendCodes: true, levels: true, levelsWeekly: true } }),
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
      prisma.tempVoiceChannel.findMany({ where: { OR: [{ ownerId: userId }, ...onAList(userId)] } }),
      prisma.tempVoiceSettings.findMany({ where: { userId } }),
      prisma.tempVoiceSettings.findMany({ where: { userId: { not: userId }, OR: onAList(userId) } }),
      prisma.starboardEntry.findMany({ where: { authorId: userId } }),
    ]);

  return {
    userId,
    leveling: { allTime: user?.levels ?? [], weekly: user?.levelsWeekly ?? [], weeklyWins },
    birthday: user?.birthday ?? null,
    friendCodes: user?.friendCodes ?? null,
    birthdayRoles,
    // Their messages that got onto a starboard. What they said is in the posts on Discord, not stored here
    starboard: starred,
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
 */
export async function deleteUserData(userId: string) {
  const without = (ids: string[]) => ids.filter((id) => id !== userId);

  await prisma.$transaction(async (tx) => {
    // Levels, weekly levels, the birthday and friend codes go with the user
    await tx.user.deleteMany({ where: { userId } });
    await tx.birthdayRole.deleteMany({ where: { userId } });
    await tx.countingUser.deleteMany({ where: { userId } });
    await tx.countingEntry.deleteMany({ where: { userId } });
    await tx.countingRun.updateMany({ where: { endedByUserId: userId }, data: { endedByUserId: null } });
    await tx.guildCounting.updateMany({ where: { highestNumberByUserId: userId }, data: { highestNumberByUserId: null } });
    await tx.guildCounting.updateMany({ where: { lastNumberByUserId: userId }, data: { lastNumberByUserId: null } });
    await tx.guildLeveling.updateMany({ where: { weeklyLastWinner: userId }, data: { weeklyLastWinner: null } });
    await tx.tempVoiceSettings.deleteMany({ where: { userId } });
    // Forgotten, so their posts aren't updated anymore. The posts are messages in the server, which its moderators can delete
    await tx.starboardEntry.deleteMany({ where: { authorId: userId } });

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
}

/** Everything stored about a server: its settings, and its members' levels and counting stats. The numbers of each counting run are left out, as there can be many. */
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
      logs: true,
      starboard: true,
      starboardEntries: true,
      reactionRoleMenus: { include: { roles: true } },
      tempVoiceCreators: true,
      tempVoiceChannels: true,
      tempVoiceSettings: true,
    },
  });

/** Delete everything stored about a server, as if the bot was just added. Everything else belongs to it and goes with it. */
export const deleteGuildData = (guildId: string) => prisma.guild.deleteMany({ where: { guildId } });
