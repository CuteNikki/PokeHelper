import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { handleDeletedMessage } from 'utility/starboard';

/** Messages deleted at once, like with a purge, which are handled like ones deleted one by one. */
export default new Event({
  name: Events.MessageBulkDelete,
  once: false,
  async execute(_client, messages, channel) {
    // One after the other, as a purge can delete up to 100 and each looks in the database
    for (const id of messages.keys()) await handleDeletedMessage(channel.guild, id);
  },
});
