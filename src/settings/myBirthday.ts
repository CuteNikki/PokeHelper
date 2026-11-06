import { ButtonBuilder, ButtonStyle, type Client } from 'discord.js';

import { getUserBirthday, setUserBirthdayDate, updateUserBirthday } from 'database/birthday';

import { DiscordLimits } from 'utility/discordLimits';
import { parseBirthday, resolveTimezone } from 'utility/birthday/dates';
import { createSettingsPanel } from 'utility/settings';

/** Custom ID of the button that asks whether to delete your birthday. */
export const DELETE_BIRTHDAY_ID = 'my-birthday:delete';

interface MyBirthday {
  /** Whether a birthday is set. Until then only the date is shown, as the rest doesn't matter yet. */
  exists: boolean;
  date: Date | null;
  timezone: string | null;
  showAge: boolean;
  announceInGuildsByDefault: boolean;
  announceInGuildIds: string[];
}

/** The date as typed into the popup, like `2000-05-01`. */
const toInput = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The servers someone can pick to announce their birthday in: the ones they share with the bot.
 * Members are only cached once seen since the bot started, so servers already picked are listed either way.
 */
export function birthdayGuildOptions(client: Client, userId: string, saved: string[]) {
  return client.guilds.cache
    .filter((guild) => guild.members.cache.has(userId) || saved.includes(guild.id))
    .first(DiscordLimits.selectOptions)
    .map((guild) => ({ value: guild.id, label: guild.name }));
}

/**
 * The servers to save from what was picked. Saved servers that weren't listed, like one the bot can't see right now, are kept,
 * as they couldn't be unpicked.
 */
export function pickedGuilds(picked: string[], listed: string[], saved: string[]): string[] {
  return [...new Set([...saved.filter((guildId) => !listed.includes(guildId)), ...picked])];
}

/** Your own birthday: the date, timezone, whether your age is shown, and where it's announced. Works in servers and DMs. */
export const myBirthdaySettings = createSettingsPanel<MyBirthday>({
  id: 'my-birthday',
  scope: 'user',
  title: (t) => t('birthday.panel.title'),
  permissions: [],
  load: async (userId) => {
    const birthday = await getUserBirthday(userId);
    return birthday
      ? { exists: true, ...birthday }
      : { exists: false, date: null, timezone: null, showAge: false, announceInGuildsByDefault: true, announceInGuildIds: [] };
  },
  notConfigured: (t) => t('birthday.panel.title'),
  header: (birthday, _context, t) => (birthday.exists ? null : t('birthday.panel.none')),
  footer: (birthday, t) =>
    birthday.exists
      ? [new ButtonBuilder().setCustomId(DELETE_BIRTHDAY_ID).setLabel(t('birthday.panel.delete')).setEmoji('🗑️').setStyle(ButtonStyle.Danger)]
      : [],
  tips: (t) => t('birthday.panel.tips', { returnObjects: true }),
  settings: [
    {
      type: 'text',
      key: 'date',
      maxLength: 10,
      required: true,
      label: (t) => t('birthday.panel.date.label'),
      description: (t) => t('birthday.panel.date.description'),
      placeholder: (t) => t('birthday.panel.date.placeholder'),
      // Stored at midnight UTC, so it's shown in UTC to not slip to the day before
      formatValue: (value, t) =>
        new Date(`${value}T00:00:00Z`).toLocaleDateString(t('locale'), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
      validate: (text, t) => (parseBirthday(text, new Date()) ? null : t('birthday.panel.date.invalid')),
      get: (birthday) => (birthday.date ? toInput(birthday.date) : null),
      set: async (userId, text) => {
        const date = text ? parseBirthday(text, new Date()) : null;
        if (date) await setUserBirthdayDate(userId, date);
      },
    },
    {
      type: 'text',
      key: 'timezone',
      maxLength: 50,
      hidden: (birthday) => !birthday.exists,
      label: (t) => t('birthday.panel.timezone.label'),
      description: (t) => t('birthday.panel.timezone.description'),
      placeholder: () => 'Europe/Berlin',
      defaultText: () => 'UTC',
      validate: (text, t) => (resolveTimezone(text) ? null : t('birthday.panel.timezone.invalid')),
      // Birthdays from before timezones kept their case are stored in lowercase
      get: (birthday) => (birthday.timezone ? (resolveTimezone(birthday.timezone) ?? birthday.timezone) : null),
      set: (userId, text) => updateUserBirthday(userId, { timezone: text ? resolveTimezone(text) : null }),
    },
    {
      type: 'boolean',
      key: 'showAge',
      defaultValue: false,
      hidden: (birthday) => !birthday.exists,
      label: (t) => t('birthday.panel.showAge.label'),
      description: (t) => t('birthday.panel.showAge.description'),
      get: (birthday) => birthday.showAge,
      set: (userId, showAge) => updateUserBirthday(userId, { showAge }),
    },
    {
      type: 'boolean',
      key: 'everywhere',
      defaultValue: true,
      hidden: (birthday) => !birthday.exists,
      label: (t) => t('birthday.panel.everywhere.label'),
      description: (t) => t('birthday.panel.everywhere.description'),
      get: (birthday) => birthday.announceInGuildsByDefault,
      set: (userId, announceInGuildsByDefault) => updateUserBirthday(userId, { announceInGuildsByDefault }),
    },
    {
      type: 'multiChoice',
      key: 'servers',
      hidden: (birthday) => !birthday.exists || birthday.announceInGuildsByDefault,
      label: (t) => t('birthday.panel.servers.label'),
      description: (t) => t('birthday.panel.servers.description'),
      placeholder: (t) => t('birthday.panel.servers.placeholder'),
      noOptions: (t) => t('birthday.panel.servers.none'),
      options: (birthday, context) => birthdayGuildOptions(context.client, context.userId, birthday.announceInGuildIds),
      get: (birthday) => birthday.announceInGuildIds,
      set: async (userId, picked, context) => {
        const saved = (await getUserBirthday(userId))?.announceInGuildIds ?? [];
        const listed = birthdayGuildOptions(context.client, userId, saved).map((option) => option.value);
        await updateUserBirthday(userId, { announceInGuildIds: pickedGuilds(picked, listed, saved) });
      },
    },
  ],
});
