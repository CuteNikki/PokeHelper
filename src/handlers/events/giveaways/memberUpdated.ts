import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getEntriesWithBonus, setEntries } from 'database/giveaways';

import { countEntries } from 'utility/giveaways/rules';
import { logger } from 'utility/logger';

/**
 * Someone's roles changed, so their entries in running giveaways with bonus roles are worked out again, which keeps the participants
 * list and its sorting right. The draw works them out once more anyway, for changes missed while the bot was offline.
 */
export default new Event({
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(_client, before, after) {
    // Without the member from before, it's not known whether their roles changed, so they're checked anyway
    if (!before.partial && before.roles.cache.size === after.roles.cache.size && before.roles.cache.every((_, id) => after.roles.cache.has(id))) return;
    try {
      const roleIds = [...after.roles.cache.keys()];
      for (const entry of await getEntriesWithBonus(after.guild.id, after.id)) {
        const entries = countEntries(roleIds, entry.giveaway.roles);
        if (entries !== entry.entries) await setEntries(entry.giveawayId, after.id, entries);
      }
    } catch (error) {
      logger.error(error, `Failed to update the giveaway entries of ${after.id} in guild ${after.guild.id}`);
    }
  },
});
