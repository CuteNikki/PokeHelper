import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { syncAllCountings } from 'utility/countingGame';

/**
 * Catch up on counting whenever a shard starts a new session, on startup and after a reconnect that couldn't resume.
 * Resumed sessions get the missed events replayed by Discord, so they don't need this.
 */
export default new Event({
  name: Events.ShardReady,
  once: false,
  async execute(client) {
    await syncAllCountings(client);
  },
});
