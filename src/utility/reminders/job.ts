import type { Client } from 'discord.js';

import { deleteReminder, getDueReminders, rescheduleReminder } from 'database/reminders';

import type { Reminder } from 'generated/prisma/client';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { nextOccurrence } from 'utility/reminders/time';
import { buildReminderMessage } from 'utility/reminders/view';

/** Send a reminder by DM. Returns whether it arrived, which it doesn't when someone's DMs are closed. */
async function sendDm(client: Client, reminder: Reminder, next: Date | null, now: Date): Promise<boolean> {
  try {
    const user = await client.users.fetch(reminder.userId);
    await user.send(buildReminderMessage(reminder, false, next, now, getTranslate(reminder.locale)));
    return true;
  } catch {
    return false;
  }
}

/** Send a reminder in the channel it was set in. Returns whether it arrived, which it doesn't when the channel is gone or the bot can't post there. */
async function sendInChannel(client: Client, reminder: Reminder, next: Date | null, now: Date): Promise<boolean> {
  if (!reminder.channelId) return false;
  try {
    const channel = await client.channels.fetch(reminder.channelId);
    if (!channel?.isSendable()) return false;
    await channel.send(buildReminderMessage(reminder, !channel.isDMBased(), next, now, getTranslate(reminder.locale)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Send the reminders that are due, where they were meant to go or else the other way: by DM or in the channel they were set in.
 * Repeating ones move on to their next time, the others are deleted. Runs regularly, so reminders missed while the bot was offline
 * go off once it's back, repeating ones once and not for every time they missed.
 */
export async function runReminderJob(client: Client) {
  const now = new Date();
  for (const reminder of await getDueReminders(now)) {
    try {
      const next = reminder.repeat ? nextOccurrence(reminder.startAt, reminder.repeat, reminder.timezone, now) : null;
      // Saved before sending, so a crash in between doesn't send it again and again
      if (next) await rescheduleReminder(reminder.id, next);
      else await deleteReminder(reminder.id);

      const ways = reminder.delivery === 'dm' ? [sendDm, sendInChannel] : [sendInChannel, sendDm];
      let delivered = false;
      for (const send of ways) if (!delivered) delivered = await send(client, reminder, next, now);
      if (!delivered) logger.warn(`Couldn't deliver reminder ${reminder.id} to ${reminder.userId}, neither by DM nor in channel ${reminder.channelId}`);
    } catch (error) {
      logger.error(error, `Failed to handle reminder ${reminder.id}`);
    }
  }
}
