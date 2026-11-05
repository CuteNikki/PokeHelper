import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { syncStarboard } from 'utility/starboard';

/** All reactions of a message removed by a moderator, which takes it off the starboard. */
export default new Event({
  name: Events.MessageReactionRemoveAll,
  once: false,
  async execute(client, message) {
    const guild = message.guildId ? client.guilds.cache.get(message.guildId) : null;
    if (guild) await syncStarboard(guild, message);
  },
});
