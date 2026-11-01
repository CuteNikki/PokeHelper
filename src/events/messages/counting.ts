import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { getCounting } from 'database/counting';

import { handleCountingMessage, runCountingTask } from 'utility/countingGame';

export default new Event({
  name: Events.MessageCreate,
  once: false,
  async execute(client, message) {
    // Ignore bot messages and non-guild messages
    if (message.author.bot || !message.inGuild()) return;

    // Filter out other channels before queueing, so only counting messages wait on each other
    const counting = await getCounting(message.guildId);
    if (!counting || message.channelId !== counting.channelId) return;

    await runCountingTask(message.guildId, () => handleCountingMessage(client, message));
  },
});
