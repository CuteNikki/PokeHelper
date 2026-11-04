import { AuditLogEvent, channelMention, Events, messageLink } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { byLine, who } from 'utility/logs/format';
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
    const files = [...message.attachments.values()].map((file) => file.name);

    await sendLog(guild, 'messageDeleted', (t) => ({
      kind: 'deleted',
      title: t('logs.messageDeleted.title'),
      about: message.partial
        ? t('logs.messageDeleted.unknown', { channel: channelMention(message.channelId) })
        : t('logs.inChannel', { user: who(message.author), channel: channelMention(message.channelId) }) + byLine(doer, t),
      details: [
        // Sent before the bot started, so it never saw who sent it or what it said
        message.partial ? `-# ${t('logs.notSeen')}` : quoteText(message.content || t('logs.noText')),
        files.length > 0 ? `**${t('logs.attachments')}**\n${files.join(', ')}` : null,
        message.stickers?.size ? `**${t('logs.stickers')}**\n${[...message.stickers.values()].map((sticker) => sticker.name).join(', ')}` : null,
      ],
      ids: message.author ? t('logs.ids.message', { user: message.author.id, message: message.id }) : t('logs.ids.messageOnly', { message: message.id }),
      link: { label: t('logs.jumpToContext'), url: messageLink(message.channelId, message.id, guild.id) },
    }));
  },
});
