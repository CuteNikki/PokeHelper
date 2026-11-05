import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getStarboardEntry } from 'database/starboard';

import { changeStars } from 'utility/starboard';

/** A moderator removed all reactions of a message, which takes everyone's star, also those given with the button. */
export default new Event({
  name: Events.MessageReactionRemoveAll,
  once: false,
  async execute(client, message) {
    const guild = message.guildId ? client.guilds.cache.get(message.guildId) : null;
    if (guild && (await getStarboardEntry(message.id))) await changeStars(guild, message, { clear: true });
  },
});
