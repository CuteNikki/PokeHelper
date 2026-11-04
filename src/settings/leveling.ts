import { ChannelType, type PermissionsString } from 'discord.js';

import { getOrCreateGuildLevelingConfiguration, setLevelingMultiplier, setLevelingReward, updateGuildLevelingConfiguration } from 'database/leveling';

import type { GuildLevelingReward, LevelingMultiplier, MultiplierTarget, GuildLeveling } from 'generated/prisma/client';
import type { Translate } from 'utility/i18next';
import { grantRewardToQualifiedMembers } from 'utility/leveling/rewards';
import { logFailure } from 'utility/response';
import { createSettingsPanel, type EntriesSetting } from 'utility/settings';

type LevelingConfig = GuildLeveling & { rewards: GuildLevelingReward[]; multipliers: LevelingMultiplier[] };

/** What the bot needs in the level up channel. */
export const LEVEL_UP_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages'];
/** The most entries in each list. Multipliers each get a row with a button, so they're limited by the components a message can have. */
const MAX_LIST = 20;
const MAX_MULTIPLIERS = 10;
const MAX_LEVEL = 1000;
const MAX_MULTIPLIER = 10;

/** Channels whose messages, threads or channels XP rules can apply to. Categories cover the channels in them. */
const XP_CHANNEL_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice, ChannelType.GuildCategory];

/** Parse a multiplier like `1.5` or `1,5`, which has to be above 0 and at most 10. */
function parseMultiplier(input: string): number | null {
  if (!/^\d+([.,]\d+)?$/.test(input)) return null;
  const value = Number(input.replace(',', '.'));
  return value > 0 && value <= MAX_MULTIPLIER ? value : null;
}

/** Parse a level, a whole number from 1 to 1000. */
function parseLevel(input: string): number | null {
  if (!/^\d+$/.test(input)) return null;
  const value = Number(input);
  return value >= 1 && value <= MAX_LEVEL ? value : null;
}

/** A list of multipliers for channels or roles. */
function multiplierSetting(type: MultiplierTarget): EntriesSetting<LevelingConfig> {
  return {
    type: 'entries',
    key: `${type}Multipliers`,
    category: `${type}Multipliers`,
    target: type,
    channelTypes: XP_CHANNEL_TYPES,
    max: MAX_MULTIPLIERS,
    presets: [0.5, 1.5, 2, 3],
    defaultValue: 2,
    formatValue: (value, t) => t('leveling.settings.multiplier', { value: value.toLocaleString(t('locale')) }),
    input: {
      label: (t) => t('leveling.settings.multipliers.input'),
      placeholder: () => '1.5',
      parse: parseMultiplier,
      invalid: (t) => t('leveling.settings.multipliers.invalid', { max: MAX_MULTIPLIER }),
    },
    label: (t) => t(`leveling.settings.${type}Multipliers.label`),
    description: (t) => t(`leveling.settings.${type}Multipliers.description`),
    get: (config) => config.multipliers.filter((entry) => entry.type === type).map((entry) => ({ targetId: entry.targetId, value: entry.multiplier })),
    set: (guildId, targetId, value) => setLevelingMultiplier(guildId, targetId, type, value),
  };
}

const update = (guildId: string, query: Partial<Omit<GuildLeveling, 'guildId'>>) => updateGuildLevelingConfiguration(guildId, query);

export const levelingSettings = createSettingsPanel<LevelingConfig>({
  id: 'leveling',
  title: (t) => t('leveling.settings.title'),
  permissions: ['ManageGuild'],
  categories: [
    { id: 'general', label: (t: Translate) => t('leveling.settings.categories.general'), emoji: '⚙️' },
    { id: 'filters', label: (t: Translate) => t('leveling.settings.categories.filters'), emoji: '🚫' },
    { id: 'rewards', label: (t: Translate) => t('leveling.settings.categories.rewards'), emoji: '🎁' },
    { id: 'channelMultipliers', label: (t: Translate) => t('leveling.settings.categories.channelMultipliers'), emoji: '📈' },
    { id: 'roleMultipliers', label: (t: Translate) => t('leveling.settings.categories.roleMultipliers'), emoji: '📈' },
  ],
  // Leveling starts turned off, so there's always a configuration to show
  load: getOrCreateGuildLevelingConfiguration,
  notConfigured: (t) => t('leveling.disabled'),
  settings: [
    {
      type: 'boolean',
      key: 'enabled',
      category: 'general',
      defaultValue: false,
      label: (t) => t('leveling.settings.enabled.label'),
      description: (t) => t('leveling.settings.enabled.description'),
      get: (config) => config.enabled,
      // Turning it on starts the count of the week, so the first reset is when the next week starts, not right away
      set: (guildId, enabled) => update(guildId, enabled ? { enabled, weeklyLastResetAt: new Date() } : { enabled }),
    },
    {
      type: 'channel',
      key: 'channel',
      category: 'general',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      botPermissions: LEVEL_UP_CHANNEL_PERMISSIONS,
      label: (t) => t('leveling.settings.channel.label'),
      description: (t) => t('leveling.settings.channel.description'),
      get: (config) => config.channelId,
      set: (guildId, channelId) => update(guildId, { channelId }),
    },
    {
      type: 'role',
      key: 'weeklyReward',
      category: 'general',
      assignable: true,
      label: (t) => t('leveling.settings.weeklyReward.label'),
      description: (t) => t('leveling.settings.weeklyReward.description'),
      get: (config) => config.weeklyReward,
      set: (guildId, weeklyReward) => update(guildId, { weeklyReward }),
    },
    {
      type: 'channels',
      key: 'ignoredChannels',
      category: 'filters',
      channelTypes: XP_CHANNEL_TYPES,
      max: MAX_LIST,
      label: (t) => t('leveling.settings.ignoredChannels.label'),
      description: (t) => t('leveling.settings.ignoredChannels.description'),
      get: (config) => config.ignoredChannels,
      set: (guildId, ignoredChannels) => update(guildId, { ignoredChannels }),
    },
    {
      type: 'channels',
      key: 'enabledChannels',
      category: 'filters',
      channelTypes: XP_CHANNEL_TYPES,
      max: MAX_LIST,
      label: (t) => t('leveling.settings.enabledChannels.label'),
      description: (t) => t('leveling.settings.enabledChannels.description'),
      get: (config) => config.enabledChannels,
      set: (guildId, enabledChannels) => update(guildId, { enabledChannels }),
    },
    {
      type: 'roles',
      key: 'ignoredRoles',
      category: 'filters',
      max: MAX_LIST,
      label: (t) => t('leveling.settings.ignoredRoles.label'),
      description: (t) => t('leveling.settings.ignoredRoles.description'),
      get: (config) => config.ignoredRoles,
      set: (guildId, ignoredRoles) => update(guildId, { ignoredRoles }),
    },
    {
      type: 'roles',
      key: 'enabledRoles',
      category: 'filters',
      max: MAX_LIST,
      label: (t) => t('leveling.settings.enabledRoles.label'),
      description: (t) => t('leveling.settings.enabledRoles.description'),
      get: (config) => config.enabledRoles,
      set: (guildId, enabledRoles) => update(guildId, { enabledRoles }),
    },
    {
      type: 'entries',
      key: 'rewards',
      category: 'rewards',
      target: 'role',
      assignable: true,
      max: MAX_LIST,
      formatValue: (value, t) => t('leveling.settings.rewards.level', { level: value }),
      formatEntry: (target, value) => `${value}: ${target}`,
      input: {
        label: (t) => t('leveling.settings.rewards.input'),
        placeholder: () => '10',
        parse: parseLevel,
        invalid: (t) => t('leveling.settings.rewards.invalid', { max: MAX_LEVEL }),
      },
      label: (t) => t('leveling.settings.rewards.label'),
      description: (t) => t('leveling.settings.rewards.description'),
      get: (config) => [...config.rewards].sort((a, b) => a.level - b.level).map((reward) => ({ targetId: reward.roleId, value: reward.level })),
      set: (guildId, roleId, level) => setLevelingReward(guildId, roleId, level),
      // Members who already reached the level get the role right away, instead of only at their next message
      onSaved: (guild, roleId, level) => {
        if (level !== null)
          void grantRewardToQualifiedMembers(guild, roleId, level).catch(logFailure(`Failed to give reward role ${roleId} in guild ${guild.id}`));
      },
    },
    multiplierSetting('channel'),
    multiplierSetting('role'),
  ],
});
