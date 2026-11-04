import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { channelChanges } from 'utility/logs/changes';
import { channelSubject } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.ChannelUpdate,
  once: false,
  async execute(_client, before, after) {
    if (before.isDMBased() || after.isDMBased()) return;
    await logServerChange(after.guild, {
      event: 'channels',
      kind: 'updated',
      label: (t) => t('logs.labels.channelUpdated'),
      subject: channelSubject(after.id, after.name),
      details: (t) => [channelChanges(before, after, t).join('\n') || null],
      id: ['channel', after.id],
      actions: [AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete],
      targetId: after.id,
    });
  },
});
