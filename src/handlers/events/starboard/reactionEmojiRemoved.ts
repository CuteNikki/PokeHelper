import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { isStarReaction, syncStarboard } from 'utility/starboard';

/** All reactions of one emoji removed by a moderator, which takes the message off the starboard when it was the star. */
export default new Event({
  name: Events.MessageReactionRemoveEmoji,
  once: false,
  async execute(client, reaction) {
    const guild = reaction.message.guildId ? client.guilds.cache.get(reaction.message.guildId) : null;
    if (guild && (await isStarReaction(reaction))) await syncStarboard(guild, reaction.message);
  },
});
