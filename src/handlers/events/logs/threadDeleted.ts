import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { channelRef, code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.ThreadDelete,
  once: false,
  async execute(_client, thread) {
    await logServerChange(thread.guild, {
      event: 'threads',
      kind: 'deleted',
      label: (t) => t('logs.labels.threadDeleted'),
      about: 'thread',
      subject: code(`#${thread.name}`),
      where: thread.parentId ? channelRef(thread.guild, thread.parentId) : null,
      id: ['channel', thread.id],
      actions: [AuditLogEvent.ThreadDelete],
      targetId: thread.id,
    });
  },
});
