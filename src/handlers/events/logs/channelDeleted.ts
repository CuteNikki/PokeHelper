import { AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

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
      subject: code(`#${channel.name}`),
      details: (t) => [channel.parentId ? `**${t('logs.changes.category')}** ${channelMention(channel.parentId)}` : null],
      id: ['channel', channel.id],
      actions: [AuditLogEvent.ChannelDelete],
      targetId: channel.id,
    });
  },
});
