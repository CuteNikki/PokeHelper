import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { handleChangedCount, runCountingTask } from 'utility/countingGame';

export default new Event({
  name: Events.MessageDelete,
  once: false,
  async execute(_, message) {
    const guildId = message.guildId;
    if (!guildId) return;

    await runCountingTask(guildId, () => handleChangedCount(message, false));
  },
});
