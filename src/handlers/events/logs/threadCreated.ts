import { channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { who } from 'utility/logs/format';
import { isIgnoredChannel, sendLog, shouldLog } from 'utility/logs/send';

/** A thread started. The thread says who started it, so the audit log isn't needed. */
export default new Event({
  name: Events.ThreadCreate,
  once: false,
  async execute(client, thread, newlyCreated) {
    // Threads the bot only just got to see, like after joining, aren't new
    if (!newlyCreated) return;
    const config = await shouldLog(thread.guild, 'threads');
    if (!config || isIgnoredChannel(config, thread.guild, thread.id)) return;
    const owner = thread.ownerId ? await client.users.fetch(thread.ownerId).catch(() => null) : null;

    await sendLog(thread.guild, 'threads', (t) => ({
      kind: 'created',
      title: t('logs.threads.created'),
      about: t('logs.threads.about', { thread: `${channelMention(thread.id)} (${thread.name})`, channel: channelMention(thread.parentId ?? thread.id) }),
      details: [owner ? `**${t('logs.threads.startedBy')}** ${who(owner)}` : null],
      ids: t('logs.ids.channel', { channel: thread.id }),
    }));
  },
});
