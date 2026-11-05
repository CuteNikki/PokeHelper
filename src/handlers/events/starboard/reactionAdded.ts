import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { changeStars, isStarReaction } from 'utility/starboard';

/** Someone starred a message by reacting, which can put it on the starboard or update its count. */
export default new Event({
  name: Events.MessageReactionAdd,
  once: false,
  async execute(client, reaction, user) {
    const guild = reaction.message.guildId ? client.guilds.cache.get(reaction.message.guildId) : null;
    const reactor = user.partial ? await user.fetch().catch(() => null) : user;
    if (guild && reactor && !reactor.bot && (await isStarReaction(reaction))) await changeStars(guild, reaction.message, { add: reactor.id });
  },
});
