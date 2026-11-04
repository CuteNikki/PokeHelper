import { AttachmentBuilder, AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { byLine } from 'utility/logs/format';
import { isIgnoredChannel, sendLog, shouldLog } from 'utility/logs/send';

/** Many messages deleted at once, like by a purge, with the ones the bot saw in a text file. */
export default new Event({
  name: Events.MessageBulkDelete,
  once: false,
  async execute(_client, messages, channel) {
    const { guild } = channel;
    const config = await shouldLog(guild, 'messagesBulkDeleted');
    if (!config || isIgnoredChannel(config, guild, channel.id)) return;
    const doer = await whoDid(guild.id, AuditLogEvent.MessageBulkDelete, channel.id);

    // Oldest first, like they were in the channel. Messages sent before the bot started are only counted
    const seen = [...messages.values()].filter((message) => !message.partial).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcript = seen
      .map((message) => `[${message.createdAt.toISOString()}] ${message.author.username} (${message.author.id}): ${message.content}`)
      .join('\n');

    await sendLog(guild, 'messagesBulkDeleted', (t) => ({
      kind: 'deleted',
      title: t('logs.messagesBulkDeleted.title', { count: messages.size }),
      about: t('logs.messagesBulkDeleted.about', { channel: channelMention(channel.id) }) + byLine(doer, t),
      details: [seen.length < messages.size ? `-# ${t('logs.messagesBulkDeleted.notSeen', { count: messages.size - seen.length })}` : null],
      ids: t('logs.ids.channel', { channel: channel.id }),
      files: seen.length > 0 ? [new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `deleted-messages-${channel.id}.txt` })] : [],
    }));
  },
});
