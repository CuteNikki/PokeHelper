import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { startGuildCleanup } from 'utility/guildCleanup';

export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(_, client) {
    await startGuildCleanup(client);
  },
});
