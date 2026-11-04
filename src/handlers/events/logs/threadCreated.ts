import { channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { avatarOf, channelSubject } from 'utility/logs/format';
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
      label: t('logs.labels.threadCreated'),
      where: thread.parentId ? channelMention(thread.parentId) : null,
      subject: channelSubject(thread.id, thread.name),
      thumbnail: avatarOf(owner),
      by: owner ? { id: owner.id, reason: null } : null,
      ids: { channel: thread.id, ...(owner ? { user: owner.id } : {}) },
    }));
  },
});
