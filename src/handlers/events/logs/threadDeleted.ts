import { AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.ThreadDelete,
  once: false,
  async execute(_client, thread) {
    await logServerChange(thread.guild, {
      event: 'threads',
      kind: 'deleted',
      label: (t) => t('logs.labels.threadDeleted'),
      subject: code(`#${thread.name}`),
      where: thread.parentId ? channelMention(thread.parentId) : null,
      id: ['channel', thread.id],
      actions: [AuditLogEvent.ThreadDelete],
      targetId: thread.id,
    });
  },
});
