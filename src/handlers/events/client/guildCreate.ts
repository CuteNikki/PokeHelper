import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { clearGuildsLeft } from 'database/guild';

export default new Event({
  name: Events.GuildCreate,
  once: false,
  async execute(_, guild) {
    // Added back before the data was deleted, so keep it
    await clearGuildsLeft([guild.id]);
  },
});
