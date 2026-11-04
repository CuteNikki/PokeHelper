import { channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { who } from 'utility/logs/format';
import { isIgnoredChannel, isIgnoredMember, quoteText, sendLog, shouldLog } from 'utility/logs/send';

/** A message edited, with what it said before and after. */
export default new Event({
  name: Events.MessageUpdate,
  once: false,
  async execute(_client, before, after) {
    if (!after.inGuild() || after.author.bot || after.webhookId) return;
    // Only the text counts, not embeds loading for a link in it
    if (!before.partial && before.content === after.content) return;
    const config = await shouldLog(after.guild, 'messageEdited');
    if (!config || isIgnoredChannel(config, after.guild, after.channelId) || isIgnoredMember(config, after.member)) return;

    await sendLog(after.guild, 'messageEdited', (t) => ({
      kind: 'updated',
      title: t('logs.messageEdited.title'),
      about: t('logs.inChannel', { user: who(after.author), channel: channelMention(after.channelId) }),
      details: [
        // Sent before the bot started, so it never saw what it said before
        `**${t('logs.before')}**\n${before.partial ? `-# ${t('logs.notSeen')}` : quoteText(before.content || t('logs.noText'))}`,
        `**${t('logs.after')}**\n${quoteText(after.content || t('logs.noText'))}`,
      ],
      ids: t('logs.ids.message', { user: after.author.id, message: after.id }),
      link: { label: t('logs.jumpToMessage'), url: after.url },
    }));
  },
});
