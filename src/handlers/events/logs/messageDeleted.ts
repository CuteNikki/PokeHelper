import { Events, messageLink } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDeleted } from 'utility/logs/audit';
import { avatarOf, channelRef, code, userSubject } from 'utility/logs/format';
import { deletedText } from 'utility/logs/messages';
import { isIgnoredChannel, isIgnoredMember, sendLog, shouldLog } from 'utility/logs/send';

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
    const doer = message.author ? await whoDeleted(guild, message.author.id, message.channelId) : null;
    const files = [...message.attachments.values()].map((file) => code(file.name));
    const stickers = [...(message.stickers?.values() ?? [])].map((sticker) => code(sticker.name));

    await sendLog(guild, 'messageDeleted', (t) => {
      const text = message.partial ? null : deletedText(message.content, message.id, t);
      return {
        kind: 'deleted',
        label: t('logs.labels.messageDeleted'),
        where: channelRef(guild, message.channelId),
        // Sent before the bot started, so it never saw who sent it or what it said
        about: 'user',
        subject: message.author ? userSubject(message.author) : t('logs.unknownAuthor'),
        thumbnail: avatarOf(message.member ?? message.author),
        by: doer,
        details: [
          ...(text?.details ?? [`-# ${t('logs.notSeen')}`]),
          files.length > 0 ? `**${t('logs.attachments')}** ${files.join(', ')}` : null,
          stickers.length > 0 ? `**${t('logs.stickers')}** ${stickers.join(', ')}` : null,
        ],
        ids: { ...(message.author ? { user: message.author.id } : {}), message: message.id, channel: message.channelId },
        link: { label: t('logs.jumpToContext'), url: messageLink(message.channelId, message.id, guild.id) },
        files: text?.files,
      };
    });
  },
});
