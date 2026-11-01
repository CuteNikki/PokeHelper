import { ChannelType, SnowflakeUtil } from 'discord.js';
import { t } from 'i18next';

import { getCounting, updateCounting } from 'database/counting';

import type { GuildCounting } from 'generated/prisma/client';
import { runCountingTask } from 'utility/countingGame';
import { createSettingsPanel } from 'utility/settings';

/** The value of the lives setting for unlimited lives, which is stored as null. */
const UNLIMITED = 'unlimited';

/** Change counting settings through the queue, so they can't change while a message is being checked. */
const update = (guildId: string, query: Partial<GuildCounting>) => runCountingTask(guildId, () => updateCounting(guildId, query));

export const countingSettings = createSettingsPanel<GuildCounting>({
  id: 'counting',
  title: () => t('counting.settings.title'),
  permissions: ['ManageChannels'],
  load: getCounting,
  notConfigured: () => t('counting.none'),
  settings: [
    {
      type: 'channel',
      key: 'channel',
      channelTypes: [ChannelType.GuildText],
      required: true,
      label: () => t('counting.settings.channel.label'),
      description: () => t('counting.settings.channel.description'),
      get: (config) => config.channelId,
      set: (guildId, channelId) =>
        runCountingTask(guildId, async () => {
          const counting = await getCounting(guildId);
          if (!counting || !channelId || counting.channelId === channelId) return;
          // In a new channel, start checking from now, so the messages already there are left alone
          await updateCounting(guildId, { channelId, lastCheckedMessageId: SnowflakeUtil.generate().toString() });
        }),
    },
    {
      type: 'choice',
      key: 'lives',
      defaultValue: UNLIMITED,
      options: [
        { value: UNLIMITED, label: () => t('counting.settings.lives.unlimited') },
        { value: '1', label: () => t('counting.settings.lives.one') },
        { value: '3', label: () => t('counting.settings.lives.count', { count: 3 }) },
        { value: '5', label: () => t('counting.settings.lives.count', { count: 5 }) },
      ],
      label: () => t('counting.settings.lives.label'),
      description: () => t('counting.settings.lives.description'),
      get: (config) => (config.maxLives === null ? UNLIMITED : String(config.maxLives)),
      set: (guildId, value) => {
        const maxLives = value === UNLIMITED ? null : Number(value);
        // Starting over with the new number of lives, rather than keeping a count that may not fit
        return update(guildId, { maxLives, livesLeft: maxLives ?? 0 });
      },
    },
    {
      type: 'boolean',
      key: 'regenerateLives',
      defaultValue: false,
      label: () => t('counting.settings.regenerateLives.label'),
      description: () => t('counting.settings.regenerateLives.description'),
      get: (config) => config.regenerateLives,
      set: (guildId, regenerateLives) => update(guildId, { regenerateLives }),
    },
    {
      type: 'boolean',
      key: 'allowMath',
      defaultValue: false,
      label: () => t('counting.settings.allowMath.label'),
      description: () => t('counting.settings.allowMath.description'),
      get: (config) => config.allowMath,
      set: (guildId, allowMath) => update(guildId, { allowMath }),
    },
    {
      type: 'boolean',
      key: 'milestoneReactions',
      defaultValue: false,
      label: () => t('counting.settings.milestoneReactions.label'),
      description: () => t('counting.settings.milestoneReactions.description'),
      get: (config) => config.milestoneReactions,
      set: (guildId, milestoneReactions) => update(guildId, { milestoneReactions }),
    },
  ],
});
