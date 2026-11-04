import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { toTranscriptMessage, transcriptFile } from 'utility/logs/files';
import { channelSubject } from 'utility/logs/format';
import { isIgnoredChannel, sendLog, shouldLog } from 'utility/logs/send';

/** Many messages deleted at once, like by a purge, with the ones the bot saw in a text file under the entry. */
export default new Event({
  name: Events.MessageBulkDelete,
  once: false,
  async execute(_client, messages, channel) {
    const { guild } = channel;
    const config = await shouldLog(guild, 'messagesBulkDeleted');
    if (!config || isIgnoredChannel(config, guild, channel.id)) return;
    const doer = await whoDid(guild.id, AuditLogEvent.MessageBulkDelete, channel.id);

    // Messages sent before the bot started are only counted, it never saw what they said
    const seen = [...messages.values()].filter((message) => !message.partial).map(toTranscriptMessage);

    await sendLog(guild, 'messagesBulkDeleted', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.messagesBulkDeleted', { count: messages.size }),
      subject: channelSubject(channel.id, channel.name),
      by: doer,
      details: [seen.length < messages.size ? `-# ${t('logs.bulkNotSeen', { count: messages.size - seen.length })}` : null],
      ids: { channel: channel.id },
      files:
        seen.length > 0
          ? [
              transcriptFile(
                seen,
                t('logs.transcriptHeading', { count: messages.size, channel: channel.name, channelId: channel.id }),
                `deleted-messages-${channel.id}.txt`,
              ),
            ]
          : [],
    }));
  },
});
