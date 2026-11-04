import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { channelRef, channelSubject } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.ChannelCreate,
  once: false,
  async execute(_client, channel) {
    await logServerChange(channel.guild, {
      event: 'channels',
      kind: 'created',
      label: (t) => t('logs.labels.channelCreated'),
      about: 'channel',
      subject: channelSubject(channel.id, channel.name),
      details: (t) => [channel.parentId ? `**${t('logs.changes.category')}** ${channelRef(channel.guild, channel.parentId)}` : null],
      id: ['channel', channel.id],
      actions: [AuditLogEvent.ChannelCreate],
      targetId: channel.id,
    });
  },
});
