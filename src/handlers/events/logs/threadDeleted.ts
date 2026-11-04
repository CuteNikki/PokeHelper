import { AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.ThreadDelete,
  once: false,
  async execute(_client, thread) {
    await logServerChange(thread.guild, {
      event: 'threads',
      kind: 'deleted',
      title: (t) => t('logs.threads.deleted'),
      about: `#${thread.name}`,
      details: (t) => [thread.parentId ? `**${t('logs.threads.channel')}** ${channelMention(thread.parentId)}` : null],
      ids: (t) => t('logs.ids.channel', { channel: thread.id }),
      actions: [AuditLogEvent.ThreadDelete],
      targetId: thread.id,
    });
  },
});
