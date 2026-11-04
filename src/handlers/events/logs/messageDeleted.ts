import { AuditLogEvent, channelMention, Events, messageLink } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { avatarOf, code, userSubject } from 'utility/logs/format';
import { isIgnoredChannel, isIgnoredMember, quoteText, sendLog, shouldLog } from 'utility/logs/send';

/** A message deleted, with what it said and its attachments, and who deleted it if it wasn't its author. */
export default new Event({
  name: Events.MessageDelete,
  once: false,
  async execute(client, message) {
    const guild = message.guildId ? client.guilds.cache.get(message.guildId) : null;
    if (!guild || message.author?.bot || message.webhookId) return;
    const config = await shouldLog(guild, 'messageDeleted');
    if (!config || isIgnoredChannel(config, guild, message.channelId) || isIgnoredMember(config, message.member)) return;

    // The audit log only says who deleted it when that wasn't its author, so no entry means they deleted it themselves
    const doer = message.author ? await whoDid(guild.id, AuditLogEvent.MessageDelete, message.author.id) : null;
    const files = [...message.attachments.values()].map((file) => code(file.name));
    const stickers = [...(message.stickers?.values() ?? [])].map((sticker) => code(sticker.name));

    await sendLog(guild, 'messageDeleted', (t) => ({
      kind: 'deleted',
      label: t('logs.labels.messageDeleted'),
      where: channelMention(message.channelId),
      // Sent before the bot started, so it never saw who sent it or what it said
      subject: message.author ? userSubject(message.author) : t('logs.unknownAuthor'),
      thumbnail: avatarOf(message.member ?? message.author),
      by: doer,
      details: [
        message.partial ? `-# ${t('logs.notSeen')}` : quoteText(message.content || t('logs.noText')),
        files.length > 0 ? `**${t('logs.attachments')}** ${files.join(', ')}` : null,
        stickers.length > 0 ? `**${t('logs.stickers')}** ${stickers.join(', ')}` : null,
      ],
      ids: { ...(message.author ? { user: message.author.id } : {}), message: message.id, channel: message.channelId },
      link: { label: t('logs.jumpToContext'), url: messageLink(message.channelId, message.id, guild.id) },
    }));
  },
});
