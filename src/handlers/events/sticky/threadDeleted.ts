import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { removeSticky, runStickyTask } from 'utility/sticky';

/** A deleted thread's sticky message goes with it. */
export default new Event({
  name: Events.ThreadDelete,
  once: false,
  async execute(_client, thread) {
    await runStickyTask(thread.id, () => removeSticky(thread.id)).catch((error: unknown) =>
      logger.error(error, `Failed to remove the sticky message of the deleted thread ${thread.id}`),
    );
  },
});
