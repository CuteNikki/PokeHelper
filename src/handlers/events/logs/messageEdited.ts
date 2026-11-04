import { channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { markChanges } from 'utility/logs/diff';
import { avatarOf, userSubject } from 'utility/logs/format';
import { isIgnoredChannel, isIgnoredMember, quoteText, sendLog, shouldLog } from 'utility/logs/send';

/** A message edited, with what it said before and after, and what changed marked. */
export default new Event({
  name: Events.MessageUpdate,
  once: false,
  async execute(_client, before, after) {
    if (!after.inGuild() || after.author.bot || after.webhookId) return;
    // Only the text counts, not embeds loading for a link in it
    if (!before.partial && before.content === after.content) return;
    const config = await shouldLog(after.guild, 'messageEdited');
    if (!config || isIgnoredChannel(config, after.guild, after.channelId) || isIgnoredMember(config, after.member)) return;

    await sendLog(after.guild, 'messageEdited', (t) => {
      // Sent before the bot started, so it never saw what it said before, and there's nothing to compare
      const marked = before.partial ? null : markChanges(before.content || t('logs.noText'), after.content || t('logs.noText'));
      return {
        kind: 'updated',
        label: t('logs.labels.messageEdited'),
        where: channelMention(after.channelId),
        subject: userSubject(after.author),
        thumbnail: avatarOf(after.member ?? after.author),
        details: [
          `**${t('logs.before')}**\n${marked ? quoteText(marked.before) : `-# ${t('logs.notSeen')}`}`,
          `**${t('logs.after')}**\n${quoteText(marked?.after ?? (after.content || t('logs.noText')))}`,
        ],
        ids: { user: after.author.id, message: after.id, channel: after.channelId },
        link: { label: t('logs.jumpToMessage'), url: after.url },
      };
    });
  },
});
