import { ChannelType, type PermissionsString } from 'discord.js';

import { getOrCreateGuildBirthdayConfiguration, updateGuildBirthdayConfiguration } from 'database/birthday';

import type { GuildBirthday } from 'generated/prisma/client';
import { createSettingsPanel } from 'utility/settings';

/** What the bot needs in the birthday announcement channel. */
const ANNOUNCEMENT_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages'];

const update = (guildId: string, query: Partial<Omit<GuildBirthday, 'guildId'>>) => updateGuildBirthdayConfiguration(guildId, query);

export const birthdaySettings = createSettingsPanel<GuildBirthday>({
  id: 'birthday',
  title: (t) => t('birthday.settings.title'),
  permissions: ['ManageGuild'],
  // Birthdays start turned off, so there's always a configuration to show
  load: getOrCreateGuildBirthdayConfiguration,
  notConfigured: (t) => t('birthday.settings.title'),
  settings: [
    {
      type: 'boolean',
      key: 'enabled',
      defaultValue: false,
      label: (t) => t('birthday.settings.enabled.label'),
      description: (t) => t('birthday.settings.enabled.description'),
      get: (config) => config.enabled,
      set: (guildId, enabled) => update(guildId, { enabled }),
    },
    {
      type: 'channel',
      key: 'channel',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      botPermissions: ANNOUNCEMENT_CHANNEL_PERMISSIONS,
      label: (t) => t('birthday.settings.channel.label'),
      description: (t) => t('birthday.settings.channel.description'),
      get: (config) => config.channelId,
      set: (guildId, channelId) => update(guildId, { channelId }),
    },
    {
      type: 'role',
      key: 'role',
      assignable: true,
      label: (t) => t('birthday.settings.role.label'),
      description: (t) => t('birthday.settings.role.description'),
      get: (config) => config.roleId,
      set: (guildId, roleId) => update(guildId, { roleId }),
    },
  ],
});
