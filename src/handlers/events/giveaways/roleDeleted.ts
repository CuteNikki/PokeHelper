import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { forgetDeletedGiveawayRole, getGiveaway } from 'database/giveaways';

import { refreshAllEntries } from 'utility/giveaways/end';
import { logGiveaway } from 'utility/giveaways/logs';
import { syncPost } from 'utility/giveaways/sync';
import { logger } from 'utility/logger';
import { code } from 'utility/text';

/**
 * A deleted role is taken out of giveaways: nobody can have it anymore, so a required one would keep everyone out. Running ones show
 * their new rules, and if it gave bonus entries, everyone's entries are worked out again. People who entered stay in. A required one
 * changes who can enter, which the logs say, also when it was the only one, as anyone can enter then.
 */
export default new Event({
  name: Events.GuildRoleDelete,
  once: false,
  async execute(_client, role) {
    try {
      for (const { id, hadBonus, wasRequired } of await forgetDeletedGiveawayRole(role.guild.id, role.id)) {
        await syncPost(role.guild, id);
        const giveaway = hadBonus || wasRequired ? await getGiveaway(role.guild.id, id) : null;
        if (!giveaway) continue;
        if (hadBonus) await refreshAllEntries(role.guild, giveaway);
        if (wasRequired) {
          const openToAll = !giveaway.roles.some((other) => other.kind === 'required');
          await logGiveaway(role.guild, 'giveawayRulesChanged', giveaway, null, (t) => [
            t('logs.giveaways.roleDeleted', { role: code(`@${role.name}`) }),
            openToAll ? t('logs.giveaways.openToAll') : null,
          ]);
        }
      }
    } catch (error) {
      logger.error(error, `Failed to take the deleted role ${role.id} out of the giveaways of guild ${role.guild.id}`);
    }
  },
});
