import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { hasSticky, scheduleRepost } from 'utility/sticky';

/** Every message in a channel with a sticky message moves it up, so it's posted again below, once the channel is quiet for a moment. */
export default new Event({
  name: Events.MessageCreate,
  once: false,
  execute(client, message) {
    if (!message.inGuild() || !hasSticky(message.channelId)) return;
    scheduleRepost(client, message.channelId);
  },
});
