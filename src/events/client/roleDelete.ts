import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { handleDeletedRole } from 'utility/roleMenu';

/** A deleted role is taken out of the role menus, so they don't keep a button that can't give anything. */
export default new Event({
  name: Events.GuildRoleDelete,
  once: false,
  async execute(_client, role) {
    try {
      await handleDeletedRole(role.guild, role.id);
    } catch (error) {
      logger.error(error, `Failed to remove the deleted role ${role.id} from the role menus of guild ${role.guild.id}`);
    }
  },
});
