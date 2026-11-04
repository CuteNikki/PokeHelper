import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getCounting } from 'database/counting';

import { handleChangedCount, runCountingTask } from 'utility/counting/game';

export default new Event({
  name: Events.MessageUpdate,
  once: false,
  async execute(_, __, message) {
    const guildId = message.guildId;
    if (!guildId) return;

    // Filtered before queueing, so edits and deletes elsewhere, like link previews loading, don't wait behind the counting game
    const counting = await getCounting(guildId);
    if (!counting?.enabled || message.channelId !== counting.channelId) return;

    await runCountingTask(guildId, () => handleChangedCount(message, true));
  },
});
