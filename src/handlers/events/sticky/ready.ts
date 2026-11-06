import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { loadStickies } from 'utility/sticky';

/** Once the channels are there, the sticky messages are loaded, and the ones that were moved up while the bot was offline are moved back down. */
export default new Event({
  name: Events.ClientReady,
  once: true,
  async execute(_, client) {
    await loadStickies(client).catch((error: unknown) => logger.error(error, 'Failed to load the sticky messages'));
  },
});
