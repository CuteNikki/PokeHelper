import { ChannelType } from 'discord.js';

import { getOrCreateGuildLogs, updateGuildLogs, type GuildLogs } from 'database/logs';

import type { Translate } from 'utility/i18next';
import { CHANNEL_FIELDS, LOG_EVENTS, LOG_GROUPS, type LogEvent, type LogGroup } from 'utility/logs/events';
import { forgetLogConfig, LOG_CHANNEL_PERMISSIONS } from 'utility/logs/send';
import { createSettingsPanel, type Setting } from 'utility/settings';

/** Discord's channel and role selects pick at most 25. */
const MAX_IGNORED = 25;
/** Channels whose messages and voice can be left out, with categories covering the channels in them. */
const IGNORABLE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildForum,
  ChannelType.GuildCategory,
];

/** Turn an event on or off, keeping the list of those turned off. */
async function setEvent(guildId: string, event: LogEvent, on: boolean) {
  const { disabledEvents } = await getOrCreateGuildLogs(guildId);
  const events = on ? disabledEvents.filter((key) => key !== event) : [...new Set([...disabledEvents, event])];
  return updateGuildLogs(guildId, { disabledEvents: events });
}

/** A group's page: its channel, then a switch for each of its events. */
function groupSettings(group: LogGroup): Setting<GuildLogs>[] {
  const field = CHANNEL_FIELDS[group];
  return [
    {
      type: 'channel',
      key: `${group}Channel`,
      category: group,
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      botPermissions: LOG_CHANNEL_PERMISSIONS,
      label: (t: Translate) => t('logs.settings.channel.label'),
      description: (t: Translate) => t('logs.settings.channel.description'),
      get: (config) => config[field],
      set: (guildId, channelId) => updateGuildLogs(guildId, { [field]: channelId }),
    },
    ...(LOG_EVENTS[group] as readonly LogEvent[]).map((event): Setting<GuildLogs> => ({
      type: 'boolean',
      key: event,
      category: group,
      defaultValue: true,
      label: (t: Translate) => t(`logs.settings.events.${event}.label`),
      description: (t: Translate) => t(`logs.settings.events.${event}.description`),
      get: (config) => !config.disabledEvents.includes(event),
      set: (guildId, on) => setEvent(guildId, event, on),
      // Without a channel, the group isn't logged at all, so its switches wouldn't do anything
      hidden: (config) => !config[field],
    })),
  ];
}

export const logSettings = createSettingsPanel<GuildLogs>({
  id: 'logs',
  title: (t) => t('logs.settings.title'),
  permissions: ['ManageGuild'],
  categories: [
    { id: 'general', label: (t) => t('logs.settings.categories.general'), emoji: '⚙️' },
    { id: 'messages', label: (t) => t('logs.settings.categories.messages'), emoji: '💬' },
    { id: 'members', label: (t) => t('logs.settings.categories.members'), emoji: '👥' },
    { id: 'moderation', label: (t) => t('logs.settings.categories.moderation'), emoji: '🔨' },
    { id: 'server', label: (t) => t('logs.settings.categories.server'), emoji: '🏠' },
    { id: 'voice', label: (t) => t('logs.settings.categories.voice'), emoji: '🔊' },
  ],
  // Logs start with no channels, so there's always a configuration to show
  load: getOrCreateGuildLogs,
  notConfigured: (t) => t('logs.settings.title'),
  // Logs read their settings from a cache, which has to forget the old ones
  onSaved: ({ guild }) => {
    if (guild) forgetLogConfig(guild.id);
    return Promise.resolve();
  },
  settings: [
    {
      type: 'boolean',
      key: 'enabled',
      category: 'general',
      defaultValue: true,
      label: (t) => t('logs.settings.enabled.label'),
      description: (t) => t('logs.settings.enabled.description'),
      get: (config) => config.enabled,
      set: (guildId, enabled) => updateGuildLogs(guildId, { enabled }),
    },
    {
      type: 'channels',
      key: 'ignoredChannels',
      category: 'general',
      channelTypes: IGNORABLE_CHANNEL_TYPES,
      max: MAX_IGNORED,
      label: (t) => t('logs.settings.ignoredChannels.label'),
      description: (t) => t('logs.settings.ignoredChannels.description'),
      get: (config) => config.ignoredChannelIds,
      set: (guildId, ignoredChannelIds) => updateGuildLogs(guildId, { ignoredChannelIds }),
    },
    {
      type: 'roles',
      key: 'ignoredRoles',
      category: 'general',
      max: MAX_IGNORED,
      label: (t) => t('logs.settings.ignoredRoles.label'),
      description: (t) => t('logs.settings.ignoredRoles.description'),
      get: (config) => config.ignoredRoleIds,
      set: (guildId, ignoredRoleIds) => updateGuildLogs(guildId, { ignoredRoleIds }),
    },
    ...LOG_GROUPS.flatMap(groupSettings),
  ],
});
