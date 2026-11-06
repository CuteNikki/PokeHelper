import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { handleDeletedEmoji } from 'utility/roleMenu';

/** Roles whose emoji is deleted get another one, as the role menus couldn't be updated with it anymore. */
export default new Event({
  name: Events.GuildEmojiDelete,
  once: false,
  async execute(_client, emoji) {
    try {
      await handleDeletedEmoji(emoji.guild, emoji.id);
    } catch (error) {
      logger.error(error, `Failed to replace the deleted emoji ${emoji.id} in the role menus of guild ${emoji.guild.id}`);
    }
  },
});
