import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

export default new Event({
  name: Events.ClientReady,
  once: true,
  execute: (_, client) => {
    console.log(`Logged in as ${client.user.tag}!`);
  },
});
