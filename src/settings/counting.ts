import { ChannelType, SnowflakeUtil } from 'discord.js';
import { t } from 'i18next';

import { getCounting, updateCounting } from 'database/counting';

import type { GuildCounting } from 'generated/prisma/client';
import { runCountingTask } from 'utility/countingGame';
import { createSettingsPanel } from 'utility/settings';

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
      type: 'boolean',
      key: 'resetOnFail',
      defaultValue: false,
      label: () => t('counting.settings.resetOnFail.label'),
      description: () => t('counting.settings.resetOnFail.description'),
      get: (config) => config.resetOnFail,
      set: (guildId, resetOnFail) => update(guildId, { resetOnFail }),
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
  ],
});
