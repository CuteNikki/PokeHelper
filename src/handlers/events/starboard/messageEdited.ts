import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getStarboardEntry } from 'database/starboard';

import { syncStarboard } from 'utility/starboard';

/** A starred message edited, so its post says the same. */
export default new Event({
  name: Events.MessageUpdate,
  once: false,
  async execute(client, _before, message) {
    const guild = message.guildId ? client.guilds.cache.get(message.guildId) : null;
    if (guild && (await getStarboardEntry(message.id))?.starboardMessageId) await syncStarboard(guild, message);
  },
});
