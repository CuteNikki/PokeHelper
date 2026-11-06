import { prisma } from 'database/index';

import type { GuildCounting, Prisma } from 'generated/prisma/client';
import { isMilestone, type CountingEvent, type CountingState } from 'utility/counting/rules';

/** Get the counting configuration for a guild. */
export const getCounting = async (guildId: string) =>
  prisma.guildCounting.findUnique({
    where: { guildId },
  });

/** Get the counting configurations of all guilds. */
export const getAllCountings = async () => prisma.guildCounting.findMany();

/**
 * Create a new counting configuration for a guild.
 * @param data.lastCheckedMessageId The message to start checking after, so older messages in the channel are left alone.
 */
export const createCounting = async (
  guildId: string,
  data: Pick<GuildCounting, 'channelId' | 'maxLives' | 'livesLeft' | 'regenerateLives' | 'allowMath' | 'lastCheckedMessageId'>,
) =>
  prisma.guildCounting.create({
    data: { guildId, ...data },
  });

/** Update the counting configuration for a guild. */
export const updateCounting = async (guildId: string, query: Partial<Omit<GuildCounting, 'guildId'>>) =>
  prisma.guildCounting.update({
    where: { guildId },
    data: query,
  });

/** Reset the counting configuration for a guild. */
export const resetCounting = async (guildId: string) =>
  prisma.guildCounting.delete({
    where: { guildId },
  });

/**
 * Save the counting state and record what happened for the stats, together, but only if no other message was checked since the state was read.
 * @param previousCheckedMessageId The last checked message ID when the state was read.
 * @param events What happened, in order: counted numbers go into the current run, resets end it.
 * @returns Whether it was saved. False means the state changed in between and nothing was saved.
 */
export const saveCountingProgress = async (guildId: string, previousCheckedMessageId: string | null, state: CountingState, events: CountingEvent[]) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.guildCounting.updateMany({
      where: { guildId, lastCheckedMessageId: previousCheckedMessageId },
      data: state,
    });
    if (count === 0) return false;
    if (events.length === 0) return true;

    let run = await tx.countingRun.findFirst({ where: { guildId, endedAt: null }, orderBy: { id: 'desc' } });
    const entries: Prisma.CountingEntryCreateManyInput[] = [];
    const users = new Map<string, { counted: number; mistakes: number; lastCountedAt: Date | null }>();
    const userStats = (userId: string) => {
      const stats = users.get(userId) ?? { counted: 0, mistakes: 0, lastCountedAt: null };
      users.set(userId, stats);
      return stats;
    };

    for (const event of events) {
      if (event.type === 'count') {
        // Counting 1 starts a new run. Without an ongoing run otherwise, like for games from before tracking, its start is unknown
        if (event.number === 1 || !run) {
          if (run) await tx.countingRun.update({ where: { id: run.id }, data: { endedAt: event.at } });
          run = await tx.countingRun.create({ data: { guildId, startedAt: event.number === 1 ? event.at : null } });
        }
        // Only milestones are looked back at, so the other numbers aren't kept, as a busy game counts thousands
        if (isMilestone(event.number)) {
          entries.push({ runId: run.id, guildId, number: event.number, userId: event.userId, messageId: event.messageId, countedAt: event.at });
        }
        const stats = userStats(event.userId);
        stats.counted++;
        stats.lastCountedAt = event.at;
      } else if (event.type === 'mistake') {
        userStats(event.userId).mistakes++;
      } else if (run) {
        await tx.countingRun.update({ where: { id: run.id }, data: { endedAt: event.at, endedByUserId: event.userId, finalNumber: event.number } });
        run = null;
      }
    }

    if (entries.length > 0) await tx.countingEntry.createMany({ data: entries });
    for (const [userId, stats] of users) {
      await tx.countingUser.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, ...stats },
        update: {
          counted: { increment: stats.counted },
          mistakes: { increment: stats.mistakes },
          ...(stats.lastCountedAt && { lastCountedAt: stats.lastCountedAt }),
        },
      });
    }
    return true;
  });
