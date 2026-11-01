import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { markGuildLeft } from 'database/guild';

export default new Event({
  name: Events.GuildDelete,
  once: false,
  async execute(_, guild) {
    // Unavailable means an outage, not that the bot was removed
    if (!guild.available) return;
    await markGuildLeft(guild.id, new Date());
  },
});
