import type { Guild, PermissionsString } from 'discord.js';

import { deleteGuildBirthdayConfiguration } from 'database/birthday';
import { getCounting, resetCounting } from 'database/counting';
import { deleteGuildLevelingConfiguration } from 'database/leveling';

import { runCountingTask } from 'utility/countingGame';
import type { Translate } from 'utility/i18next';
import { createResponse, type ResponsePayload } from 'utility/response';

/** What happens when a confirmation is answered. */
interface Confirmation {
  /** Needed to confirm, the same the command that asked needs. */
  permissions: PermissionsString[];
  /** Shown when cancelled. */
  cancelled: (t: Translate) => string;
  /** Do it, and return what to show afterwards. */
  run: (guild: Guild, t: Translate) => Promise<ResponsePayload>;
}

/** Every action a confirmation can ask about, by the name used in the custom IDs of its buttons. */
export const confirmations: Record<string, Confirmation> = {
  'counting-reset': {
    permissions: ['ManageChannels'],
    cancelled: (t) => t('counting.resetConfiguration.cancelled'),
    async run(guild, t) {
      await runCountingTask(guild.id, async () => {
        if (await getCounting(guild.id)) await resetCounting(guild.id);
      });
      return createResponse(t('counting.resetConfiguration.success'), 'warning');
    },
  },
  'leveling-reset': {
    permissions: ['ManageGuild'],
    cancelled: (t) => t('leveling.resetConfiguration.cancelled'),
    async run(guild, t) {
      await deleteGuildLevelingConfiguration(guild.id);
      return createResponse(t('leveling.resetConfiguration.success'), 'warning');
    },
  },
  'birthday-reset': {
    permissions: ['ManageGuild'],
    cancelled: (t) => t('birthday.resetConfiguration.cancelled'),
    async run(guild, t) {
      await deleteGuildBirthdayConfiguration(guild.id);
      return createResponse(t('birthday.resetConfiguration.success'), 'warning');
    },
  },
};
