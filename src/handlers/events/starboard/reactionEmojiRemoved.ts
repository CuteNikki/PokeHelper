import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { changeStars, isStarReaction } from 'utility/starboard';

/** A moderator removed all reactions of one emoji. When it's the star, everyone's star goes, also those given with the button. */
export default new Event({
  name: Events.MessageReactionRemoveEmoji,
  once: false,
  async execute(client, reaction) {
    const guild = reaction.message.guildId ? client.guilds.cache.get(reaction.message.guildId) : null;
    if (guild && (await isStarReaction(reaction))) await changeStars(guild, reaction.message, { clear: true });
  },
});
