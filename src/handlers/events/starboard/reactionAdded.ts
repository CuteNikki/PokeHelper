import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { isStarReaction, syncStarboard } from 'utility/starboard';

/** A star added, which can put a message on the starboard or update its count. */
export default new Event({
  name: Events.MessageReactionAdd,
  once: false,
  async execute(client, reaction) {
    const guild = reaction.message.guildId ? client.guilds.cache.get(reaction.message.guildId) : null;
    if (guild && (await isStarReaction(reaction))) await syncStarboard(guild, reaction.message);
  },
});
