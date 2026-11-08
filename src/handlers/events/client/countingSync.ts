import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { syncAllCountings } from 'utility/counting/game';

/** Catch up on counting whenever a shard starts a new session. Resumed sessions get the missed events replayed by Discord. */
export default new Event({
  name: Events.ShardReady,
  once: false,
  async execute(client) {
    await syncAllCountings(client);
  },
});
