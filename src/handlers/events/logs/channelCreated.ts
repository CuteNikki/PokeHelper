import { AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.ChannelCreate,
  once: false,
  async execute(_client, channel) {
    await logServerChange(channel.guild, {
      event: 'channels',
      kind: 'created',
      title: (t) => t('logs.channels.created'),
      about: `${channelMention(channel.id)} (${channel.name})`,
      details: (t) => [channel.parentId ? `**${t('logs.changes.category')}** ${channelMention(channel.parentId)}` : null],
      ids: (t) => t('logs.ids.channel', { channel: channel.id }),
      actions: [AuditLogEvent.ChannelCreate],
      targetId: channel.id,
    });
  },
});
