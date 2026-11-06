import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { removeSticky, runStickyTask } from 'utility/sticky';

/** A deleted channel's sticky message goes with it. */
export default new Event({
  name: Events.ChannelDelete,
  once: false,
  async execute(_client, channel) {
    if (channel.isDMBased() || !channel.isTextBased()) return;
    await runStickyTask(channel.id, () => removeSticky(channel.id)).catch((error: unknown) =>
      logger.error(error, `Failed to remove the sticky message of the deleted channel ${channel.id}`),
    );
  },
});
