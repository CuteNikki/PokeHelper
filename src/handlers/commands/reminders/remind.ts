import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import { Command } from 'classes/base/command';

import { countUserReminders, createReminder, getReminderTimezone, getUserReminders, MAX_REMINDERS, setReminderTimezone } from 'database/reminders';

import { DiscordLimits } from 'utility/discordLimits';
import { resolveTimezone } from 'utility/birthday/dates';
import { getTranslate } from 'utility/i18next';
import { getWallTime, MAX_YEARS_AHEAD, parseDuration, parseWhen, type ReminderRepeat } from 'utility/reminders/time';
import { buildReminderList, formatDue } from 'utility/reminders/view';
import { createResponse, sendError, sendResponse } from 'utility/response';

const MAX_TEXT = 1000;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('remind')
    .setDescription('Get reminded of something later')
    .addSubcommand((cmd) =>
      cmd
        .setName('set')
        .setDescription('Set a reminder, once or repeating')
        .addStringOption((option) =>
          option.setName('when').setDescription('Like 10m, 2h 30m, 18:00, tomorrow 9am, friday 6pm or 24.12. 18:00').setRequired(true).setMaxLength(100),
        )
        .addStringOption((option) => option.setName('text').setDescription('What to remind you of').setRequired(true).setMaxLength(MAX_TEXT))
        .addStringOption((option) =>
          option
            .setName('repeat')
            .setDescription('Whether it comes back. Defaults to once.')
            .setRequired(false)
            .addChoices(
              { name: 'Once', value: 'once' },
              { name: 'Daily', value: 'daily' },
              { name: 'Weekly', value: 'weekly' },
              { name: 'Monthly', value: 'monthly' },
              { name: 'Yearly', value: 'yearly' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('send-to')
            .setDescription('Where it goes. Defaults to your DMs, with this channel if those are closed.')
            .setRequired(false)
            .addChoices({ name: 'My DMs', value: 'dm' }, { name: 'This channel', value: 'channel' }),
        )
        .addStringOption((option) =>
          option
            .setName('timezone')
            .setDescription('Your timezone for dates and times, like Europe/Berlin. Remembered for next time.')
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('list').setDescription('See and delete your reminders')),

  async autocomplete(interaction) {
    // Spaces work like underscores, so `new york` finds America/New_York
    const search = interaction.options.getFocused().toLowerCase().replace(/\s+/g, '_');
    const now = new Date();
    const choices = Intl.supportedValuesOf('timeZone')
      .filter((timezone) => timezone.toLowerCase().includes(search))
      .slice(0, DiscordLimits.autocompleteChoices)
      .map((timezone) => {
        // With the time it is there, which helps finding the right one
        const wall = getWallTime(now, timezone);
        return { name: `${timezone} (${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')})`, value: timezone };
      });
    await interaction.respond(choices);
  },

  async execute(interaction) {
    switch (interaction.options.getSubcommand()) {
      case 'set':
        return handleSet(interaction);
      case 'list':
        return handleList(interaction);
    }
  },
});

/** Set a reminder. Only who set it sees the answer, as it's about them. */
async function handleSet(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const userId = interaction.user.id;

  const timezoneInput = interaction.options.getString('timezone');
  const givenTimezone = timezoneInput ? resolveTimezone(timezoneInput) : null;
  if (timezoneInput && !givenTimezone) return sendError(interaction, t('reminders.set.invalidTimezone'));

  if ((await countUserReminders(userId)) >= MAX_REMINDERS) return sendError(interaction, t('reminders.set.full', { max: MAX_REMINDERS }));

  const savedTimezone = await getReminderTimezone(userId);
  const timezone = givenTimezone ?? savedTimezone ?? 'UTC';
  const input = interaction.options.getString('when', true);
  const now = new Date();
  const dueAt = parseWhen(input, now, timezone);
  if (typeof dueAt === 'string') return sendError(interaction, t(`reminders.set.${dueAt}`, { max: MAX_YEARS_AHEAD }));

  // Remembered for the next ones, and saved only once the reminder is fine
  if (givenTimezone && givenTimezone !== savedTimezone) await setReminderTimezone(userId, givenTimezone);

  const repeatInput = interaction.options.getString('repeat') ?? 'once';
  const repeat = repeatInput === 'once' ? null : (repeatInput as ReminderRepeat);
  const delivery = interaction.options.getString('send-to') === 'channel' ? 'channel' : 'dm';
  const reminder = await createReminder({
    userId,
    text: interaction.options.getString('text', true),
    dueAt,
    startAt: dueAt,
    repeat,
    timezone,
    delivery,
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    locale: interaction.locale,
  });
  if (!reminder) return sendError(interaction, t('reminders.set.full', { max: MAX_REMINDERS }));

  const lines = [
    t('reminders.set.title'),
    t('reminders.set.when', { due: formatDue(reminder.dueAt) }),
    t(`reminders.set.details`, { repeat: t(`reminders.repeat.${repeat ?? 'once'}`), delivery: t(`reminders.delivery.${delivery}`) }),
  ];
  // Dates and times without a timezone are in UTC, which isn't most people's, so they're told how to change it
  if (!givenTimezone && !savedTimezone && !parseDuration(input, now)) lines.push(t('reminders.set.utc'));
  return sendResponse(interaction, createResponse(lines.join('\n'), 'success'), { ephemeral: true });
}

/** Your reminders, which only you see. */
async function handleList(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  return sendResponse(interaction, buildReminderList(await getUserReminders(interaction.user.id), t), { ephemeral: true });
}
