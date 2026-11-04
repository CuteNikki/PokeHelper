import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getCounting } from 'database/counting';

import { handleCountingMessage, isPlayerMessage, runCountingTask } from 'utility/counting/game';

export default new Event({
  name: Events.MessageCreate,
  once: false,
  async execute(client, message) {
    // Only messages members typed themselves count, not bot or system messages
    if (!isPlayerMessage(message) || !message.inGuild()) return;

    // Filter out other channels before queueing, so only counting messages wait on each other
    const counting = await getCounting(message.guildId);
    if (!counting || message.channelId !== counting.channelId) return;

    await runCountingTask(message.guildId, () => handleCountingMessage(client, message));
  },
});
