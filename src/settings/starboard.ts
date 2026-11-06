import { ChannelType } from 'discord.js';

import { getOrCreateGuildStarboard, updateGuildStarboard, type GuildStarboard } from 'database/starboard';

import { formatNumber } from 'utility/duration';
import { parseEmoji } from 'utility/roleMenu';
import { createSettingsPanel } from 'utility/settings';
import { DEFAULT_STAR_EMOJI, DEFAULT_THRESHOLD, MAX_THRESHOLD, STARBOARD_CHANNEL_PERMISSIONS } from 'utility/starboard';

/** Discord's channel selects pick at most 25. */
const MAX_IGNORED = 25;
/** Long enough for a server emoji typed in full, like `<a:name:id>`. */
const MAX_EMOJI_LENGTH = 64;
/** Channels whose reactions can be left out, with categories covering the channels in them. */
const IGNORABLE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildForum,
  ChannelType.GuildCategory,
];

/** The number of reactions typed, or null if it isn't a whole number in range. */
export function parseThreshold(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value >= 1 && value <= MAX_THRESHOLD ? value : null;
}

export const starboardSettings = createSettingsPanel<GuildStarboard>({
  id: 'starboard',
  title: (t) => t('starboard.settings.title'),
  permissions: ['ManageGuild'],
  // Made without a channel, so there's always something to show and nothing is posted until one is picked
  load: getOrCreateGuildStarboard,
  notConfigured: (t) => t('starboard.settings.title'),
  header: (config, _context, t) => (config.channelId ? null : t('starboard.settings.noChannel')),
  tips: (t) => t('starboard.tips', { returnObjects: true }),
  settings: [
    {
      type: 'boolean',
      key: 'enabled',
      defaultValue: true,
      label: (t) => t('starboard.settings.enabled.label'),
      description: (t) => t('starboard.settings.enabled.description'),
      get: (config) => config.enabled,
      set: (guildId, enabled) => updateGuildStarboard(guildId, { enabled }),
    },
    {
      type: 'channel',
      key: 'channel',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      botPermissions: STARBOARD_CHANNEL_PERMISSIONS,
      label: (t) => t('starboard.settings.channel.label'),
      description: (t) => t('starboard.settings.channel.description'),
      get: (config) => config.channelId,
      set: (guildId, channelId) => updateGuildStarboard(guildId, { channelId }),
    },
    {
      type: 'text',
      key: 'emoji',
      maxLength: MAX_EMOJI_LENGTH,
      label: (t) => t('starboard.settings.emoji.label'),
      description: (t) => t('starboard.settings.emoji.description'),
      placeholder: (t) => t('starboard.settings.emoji.placeholder'),
      defaultText: () => DEFAULT_STAR_EMOJI,
      validate: (text, t, context) => (parseEmoji(text, context.guild?.emojis.cache.values() ?? []) ? null : t('starboard.settings.emoji.invalid')),
      get: (config) => config.emoji,
      set: (guildId, text, context) => updateGuildStarboard(guildId, { emoji: text ? parseEmoji(text, context.guild?.emojis.cache.values() ?? []) : null }),
    },
    {
      type: 'text',
      key: 'threshold',
      maxLength: 3,
      label: (t) => t('starboard.settings.threshold.label'),
      description: (t) => t('starboard.settings.threshold.description'),
      defaultText: () => String(DEFAULT_THRESHOLD),
      formatValue: (value, t) => formatNumber(Number(value), t),
      validate: (text, t) => (parseThreshold(text) ? null : t('starboard.settings.threshold.invalid', { max: MAX_THRESHOLD })),
      get: (config) => (config.threshold === null ? null : String(config.threshold)),
      set: (guildId, text) => updateGuildStarboard(guildId, { threshold: text ? parseThreshold(text) : null }),
    },
    {
      type: 'channels',
      key: 'ignoredChannels',
      channelTypes: IGNORABLE_CHANNEL_TYPES,
      max: MAX_IGNORED,
      label: (t) => t('starboard.settings.ignoredChannels.label'),
      description: (t) => t('starboard.settings.ignoredChannels.description'),
      get: (config) => config.ignoredChannelIds,
      set: (guildId, ignoredChannelIds) => updateGuildStarboard(guildId, { ignoredChannelIds }),
    },
  ],
});
