import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { handleDeletedEmoji } from 'utility/roleMenu';
import { handleDeletedStarEmoji } from 'utility/starboard';

/** A deleted emoji is replaced where the bot shows it on buttons, which Discord wouldn't take with it anymore: in role menus and as the starboard's star. */
export default new Event({
  name: Events.GuildEmojiDelete,
  once: false,
  async execute(_client, emoji) {
    await handleDeletedEmoji(emoji.guild, emoji.id).catch((error: unknown) =>
      logger.error(error, `Failed to replace the deleted emoji ${emoji.id} in the role menus of guild ${emoji.guild.id}`),
    );
    await handleDeletedStarEmoji(emoji.guild.id, emoji.id).catch((error: unknown) =>
      logger.error(error, `Failed to reset the deleted star emoji ${emoji.id} of guild ${emoji.guild.id}`),
    );
  },
});
