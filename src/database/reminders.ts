import { prisma } from 'database/index';

import type { Prisma } from 'generated/prisma/client';

/** The most reminders someone can have, which is also the most a select can list to delete. */
export const MAX_REMINDERS = 25;

/** Someone's reminders, the next one first. */
export const getUserReminders = (userId: string) => prisma.reminder.findMany({ where: { userId }, orderBy: { dueAt: 'asc' } });

export const countUserReminders = (userId: string) => prisma.reminder.count({ where: { userId } });

/** Add a reminder, making sure the user is stored first. */
export const createReminder = (data: Omit<Prisma.ReminderUncheckedCreateInput, 'id'>) =>
  prisma.$transaction(async (tx) => {
    await tx.user.upsert({ where: { userId: data.userId }, update: {}, create: { userId: data.userId } });
    return tx.reminder.create({ data });
  });

/** Delete one of someone's reminders. Returns whether there was one, as it may have gone off or been deleted meanwhile. */
export const deleteUserReminder = async (userId: string, id: string) => (await prisma.reminder.deleteMany({ where: { id, userId } })).count > 0;

export const getReminder = (id: string) => prisma.reminder.findUnique({ where: { id } });

/** The reminders that are due, the oldest first. */
export const getDueReminders = (now: Date) => prisma.reminder.findMany({ where: { dueAt: { lte: now } }, orderBy: { dueAt: 'asc' } });

/** Move a repeating reminder to its next time. */
export const rescheduleReminder = (id: string, dueAt: Date) => prisma.reminder.update({ where: { id }, data: { dueAt } });

export const deleteReminder = (id: string) => prisma.reminder.deleteMany({ where: { id } });

/** The timezone someone's reminders are in, or null if they haven't picked one. */
export const getReminderTimezone = async (userId: string) =>
  (await prisma.user.findUnique({ where: { userId }, select: { reminderTimezone: true } }))?.reminderTimezone ?? null;

export const setReminderTimezone = (userId: string, reminderTimezone: string) =>
  prisma.user.upsert({ where: { userId }, update: { reminderTimezone }, create: { userId, reminderTimezone } });
