import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { handleDeletedMessage } from 'utility/starboard';

/** A starred message deleted, whose post goes too, or a post deleted by hand, which then isn't posted again. */
export default new Event({
  name: Events.MessageDelete,
  once: false,
  async execute(client, message) {
    const guild = message.guildId ? client.guilds.cache.get(message.guildId) : null;
    if (guild) await handleDeletedMessage(guild, message.id);
  },
});
