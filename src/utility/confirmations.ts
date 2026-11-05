import type { Guild, PermissionsString } from 'discord.js';

import { deleteGuildBirthdayConfiguration, deleteUserBirthday } from 'database/birthday';
import { getCounting, resetCounting } from 'database/counting';
import { deleteGuildLevelingConfiguration } from 'database/leveling';
import { deleteGuildLogs } from 'database/logs';
import { deleteGuildStarboard } from 'database/starboard';

import { myBirthdaySettings } from 'settings/myBirthday';

import { runCountingTask } from 'utility/counting/game';
import type { Translate } from 'utility/i18next';
import { forgetLogConfig } from 'utility/logs/send';
import { buildPrivacyPanel, deleteOwnData, deleteServerData, GUILD_DATA_PERMISSIONS } from 'utility/privacy';
import { createResponse, type ResponsePayload } from 'utility/response';
import type { SettingsContext } from 'utility/settings';

/** What happens when a confirmation is answered. */
interface Confirmation {
  /** Whose it is: a server's, which needs the permissions there, or the user's own, which they can confirm anywhere, also in DMs. */
  scope: 'guild' | 'user';
  /** Needed to confirm server actions, the same the command that asked needs. */
  permissions: PermissionsString[];
  /** What to show when cancelled. */
  cancel: (context: SettingsContext, t: Translate) => Promise<ResponsePayload>;
  /** Do it, and return what to show afterwards. */
  run: (context: SettingsContext, t: Translate) => Promise<ResponsePayload>;
}

/** The server of a server action, which are only confirmed in servers. */
function guildOf(context: SettingsContext): Guild {
  if (!context.guild) throw new Error('A server action was confirmed outside a server');
  return context.guild;
}

const nothingReset = (key: 'counting' | 'leveling' | 'birthday' | 'logs' | 'starboard') => (_context: SettingsContext, t: Translate) =>
  Promise.resolve(createResponse(t(`${key}.resetConfiguration.cancelled`), 'info'));

/** Every action a confirmation can ask about, by the name used in the custom IDs of its buttons. */
export const confirmations: Record<string, Confirmation> = {
  'counting-reset': {
    scope: 'guild',
    permissions: ['ManageChannels'],
    cancel: nothingReset('counting'),
    async run(context, t) {
      const guildId = guildOf(context).id;
      await runCountingTask(guildId, async () => {
        if (await getCounting(guildId)) await resetCounting(guildId);
      });
      return createResponse(t('counting.resetConfiguration.success'), 'warning');
    },
  },
  'leveling-reset': {
    scope: 'guild',
    permissions: ['ManageGuild'],
    cancel: nothingReset('leveling'),
    async run(context, t) {
      await deleteGuildLevelingConfiguration(guildOf(context).id);
      return createResponse(t('leveling.resetConfiguration.success'), 'warning');
    },
  },
  'logs-reset': {
    scope: 'guild',
    permissions: ['ManageGuild'],
    cancel: nothingReset('logs'),
    async run(context, t) {
      const guildId = guildOf(context).id;
      await deleteGuildLogs(guildId);
      forgetLogConfig(guildId);
      return createResponse(t('logs.resetConfiguration.success'), 'warning');
    },
  },
  'starboard-reset': {
    scope: 'guild',
    permissions: ['ManageGuild'],
    cancel: nothingReset('starboard'),
    async run(context, t) {
      await deleteGuildStarboard(guildOf(context).id);
      return createResponse(t('starboard.resetConfiguration.success'), 'warning');
    },
  },
  'birthday-reset': {
    scope: 'guild',
    permissions: ['ManageGuild'],
    cancel: nothingReset('birthday'),
    async run(context, t) {
      await deleteGuildBirthdayConfiguration(guildOf(context).id);
      return createResponse(t('birthday.resetConfiguration.success'), 'warning');
    },
  },
  // From /privacy, which is shown again when cancelled
  'privacy-delete-user': {
    scope: 'user',
    permissions: [],
    cancel: (context, t) => Promise.resolve(buildPrivacyPanel(context, t)),
    run: deleteOwnData,
  },
  'privacy-delete-guild': {
    scope: 'guild',
    permissions: GUILD_DATA_PERMISSIONS,
    cancel: (context, t) => Promise.resolve(buildPrivacyPanel(context, t)),
    run: deleteServerData,
  },
  // Your own birthday, from its panel, which is shown again either way
  'birthday-delete': {
    scope: 'user',
    permissions: [],
    cancel: (context, t) => myBirthdaySettings.render(context, t),
    async run(context, t) {
      await deleteUserBirthday(context.userId);
      return myBirthdaySettings.render(context, t);
    },
  },
};
