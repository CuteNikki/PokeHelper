import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import type { Reminder } from 'generated/prisma/client';
import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';
import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber, MINUTE } from 'utility/duration';
import { shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The select that deletes a reminder from the list. */
export const REMINDER_DELETE_ID = 'reminder-delete';
/** The button on a repeating reminder that stops it, followed by its ID. */
export const REMINDER_STOP_PREFIX = 'reminder-stop:';

/** How late a reminder can go off before it says it's late, like after the bot was offline. */
const LATE_AFTER = 2 * MINUTE;
/** The most of a reminder's text the list shows. */
const MAX_LIST_TEXT = 200;
/** Room left under Discord's text limit, for anything a translation adds. */
const TEXT_MARGIN = 100;

/** When a reminder goes off, as a date Discord shows in everyone's own time, and how long until then. */
export const formatDue = (dueAt: Date) => `${time(dueAt, TimestampStyles.LongDateShortTime)} (${time(dueAt, TimestampStyles.RelativeTime)})`;

/**
 * A reminder going off.
 * @param inChannel Whether it's sent in a channel, where it mentions who it's for, instead of a DM.
 * @param next When a repeating one comes back, or null for one that doesn't.
 */
export function buildReminderMessage(reminder: Reminder, inChannel: boolean, next: Date | null, now: Date, t: Translate): ResponsePayload {
  const notes = [t('reminders.message.set', { time: time(reminder.createdAt, TimestampStyles.RelativeTime) })];
  if (now.getTime() - reminder.dueAt.getTime() > LATE_AFTER)
    notes.push(t('reminders.message.late', { time: time(reminder.dueAt, TimestampStyles.RelativeTime) }));
  if (next) notes.push(t('reminders.message.next', { time: time(next, TimestampStyles.RelativeTime) }));

  const title = inChannel ? t('reminders.message.titleFor', { user: userMention(reminder.userId) }) : t('reminders.message.title');
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([title, reminder.text, subtext(notes.join(' · '))].join('\n')));

  // Repeating ones can be stopped right where they show up
  const stop = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REMINDER_STOP_PREFIX}${reminder.id}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔕')
      .setLabel(t('reminders.message.stop')),
  );
  // Only who it's for is mentioned, never anyone or anything mentioned in the text
  return {
    components: next ? [container, stop] : [container],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { users: inChannel ? [reminder.userId] : [] },
  };
}

/** How often a reminder comes back, and where it goes. */
function describe(reminder: Reminder, t: Translate) {
  const repeat = reminder.repeat ? t(`reminders.repeat.${reminder.repeat}`) : t('reminders.repeat.once');
  return `${repeat} · ${t(`reminders.delivery.${reminder.delivery}`)}`;
}

/** Someone's reminders, the next one first, with a select to delete one. */
export function buildReminderList(reminders: Reminder[], t: Translate): ResponsePayload {
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reminders.list.title')));

  if (reminders.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('reminders.list.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const line = (reminder: Reminder, index: number, text: string) =>
    t('reminders.list.entry', {
      position: formatNumber(index + 1, t),
      text,
      due: formatDue(reminder.dueAt),
      details: describe(reminder, t),
    });
  // The texts share what's left of Discord's limit for a message's text, so a long list still fits
  const rest = t('reminders.list.title').length + reminders.reduce((sum, reminder, index) => sum + line(reminder, index, '').length + 1, 0);
  const perText = Math.min(MAX_LIST_TEXT, Math.floor((DiscordLimits.messageTextLength - TEXT_MARGIN - rest) / reminders.length));
  const lines = reminders.map((reminder, index) => line(reminder, index, shorten(reminder.text.replace(/\s+/g, ' '), perText)));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  const select = new StringSelectMenuBuilder()
    .setCustomId(REMINDER_DELETE_ID)
    .setPlaceholder(t('reminders.list.delete'))
    .addOptions(
      // Never more than a select takes, even if someone got past the limit
      reminders.slice(0, DiscordLimits.selectOptions).map((reminder, index) =>
        new StringSelectMenuOptionBuilder()
          .setValue(reminder.id)
          .setLabel(shorten(`${index + 1}. ${reminder.text.replace(/\s+/g, ' ')}`, DiscordLimits.optionLabelLength))
          .setDescription(
            shorten(
              `${reminder.dueAt.toLocaleString(t('locale'), { timeZone: reminder.timezone, dateStyle: 'medium', timeStyle: 'short' })} · ${describe(reminder, t)}`,
              DiscordLimits.optionLabelLength,
            ),
          ),
      ),
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
