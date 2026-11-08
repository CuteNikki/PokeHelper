import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { forgetDeletedGiveawayRole, getGiveaway } from 'database/giveaways';

import { refreshAllEntries } from 'utility/giveaways/end';
import { syncPost } from 'utility/giveaways/sync';
import { logger } from 'utility/logger';

/**
 * A deleted role is taken out of giveaways: nobody can have it anymore, so a required one would keep everyone out. Running ones show
 * their new rules, and if it gave bonus entries, everyone's entries are worked out again. People who entered stay in.
 */
export default new Event({
  name: Events.GuildRoleDelete,
  once: false,
  async execute(_client, role) {
    try {
      for (const { id, hadBonus } of await forgetDeletedGiveawayRole(role.guild.id, role.id)) {
        await syncPost(role.guild, id);
        const giveaway = hadBonus ? await getGiveaway(role.guild.id, id) : null;
        if (giveaway) await refreshAllEntries(role.guild, giveaway);
      }
    } catch (error) {
      logger.error(error, `Failed to take the deleted role ${role.id} out of the giveaways of guild ${role.guild.id}`);
    }
  },
});
