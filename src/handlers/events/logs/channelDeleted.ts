import { AuditLogEvent, bold, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { channelRef } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';
import { code } from 'utility/text';

export default new Event({
  name: Events.ChannelDelete,
  once: false,
  async execute(_client, channel) {
    if (channel.isDMBased()) return;
    await logServerChange(channel.guild, {
      event: 'channels',
      kind: 'deleted',
      label: (t) => t('logs.labels.channelDeleted'),
      // A mention of a deleted channel shows as unknown, so the name says which it was
      about: 'channel',
      subject: code(`#${channel.name}`),
      details: (t) => [channel.parentId ? `${bold(t('logs.changes.category'))} ${channelRef(channel.guild, channel.parentId)}` : null],
      id: ['channel', channel.id],
      actions: [AuditLogEvent.ChannelDelete],
      targetId: channel.id,
    });
  },
});
