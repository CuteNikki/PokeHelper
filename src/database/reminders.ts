import { prisma } from 'database/index';

import type { Prisma } from 'generated/prisma/client';

import { DiscordLimits } from 'utility/discordLimits';

/** The most reminders someone can have, as many as the select deleting them can list. */
export const MAX_REMINDERS = DiscordLimits.selectOptions;

/** Someone's reminders, the next one first. */
export const getUserReminders = (userId: string) => prisma.reminder.findMany({ where: { userId }, orderBy: { dueAt: 'asc' } });

export const countUserReminders = (userId: string) => prisma.reminder.count({ where: { userId } });

/**
 * Add a reminder, making sure the user is stored first.
 * @returns The reminder, or null if they already have the most there can be.
 */
export const createReminder = (data: Omit<Prisma.ReminderUncheckedCreateInput, 'id'>) =>
  prisma.$transaction(async (tx) => {
    // One at a time per user, so two at once can't both pass the count and go over the limit
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reminders:${data.userId}`}))`;
    if ((await tx.reminder.count({ where: { userId: data.userId } })) >= MAX_REMINDERS) return null;
    await tx.user.upsert({ where: { userId: data.userId }, update: {}, create: { userId: data.userId } });
    return tx.reminder.create({ data });
  });

/** Delete one of someone's reminders. Returns whether there was one, as it may have gone off or been deleted meanwhile. */
export const deleteUserReminder = async (userId: string, id: string) => (await prisma.reminder.deleteMany({ where: { id, userId } })).count > 0;

export const getReminder = (id: string) => prisma.reminder.findUnique({ where: { id } });

/** The reminders that are due, the oldest first. */
export const getDueReminders = (now: Date) => prisma.reminder.findMany({ where: { dueAt: { lte: now } }, orderBy: { dueAt: 'asc' } });

/** Move a repeating reminder to its next time. Returns whether it's still there, as it may have been deleted meanwhile. */
export const rescheduleReminder = async (id: string, dueAt: Date) => (await prisma.reminder.updateMany({ where: { id }, data: { dueAt } })).count > 0;

/** Delete a reminder. Returns whether it was still there. */
export const deleteReminder = async (id: string) => (await prisma.reminder.deleteMany({ where: { id } })).count > 0;

/** The timezone someone's reminders are in, or null if they haven't picked one. */
export const getReminderTimezone = async (userId: string) =>
  (await prisma.user.findUnique({ where: { userId }, select: { reminderTimezone: true } }))?.reminderTimezone ?? null;

export const setReminderTimezone = (userId: string, reminderTimezone: string) =>
  prisma.user.upsert({ where: { userId }, update: { reminderTimezone }, create: { userId, reminderTimezone } });
