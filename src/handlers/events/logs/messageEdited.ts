import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { avatarOf, channelRef, userSubject } from 'utility/logs/format';
import { editedText } from 'utility/logs/messages';
import { isIgnoredChannel, isIgnoredMember, sendLog, shouldLog } from 'utility/logs/send';
import { MINUTE } from 'utility/duration';

/** How long ago an edit can be to be the one the update is about, as the update can arrive a bit later. */
const JUST_EDITED = MINUTE;

/** A message edited, with what it said before and after, and what changed marked. */
export default new Event({
  name: Events.MessageUpdate,
  once: false,
  async execute(_client, before, after) {
    if (!after.inGuild() || after.author.bot || after.webhookId) return;
    // Only the text counts, not embeds loading for a link in it
    if (!before.partial && before.content === after.content) return;
    // For one sent before the bot started there's nothing to compare, but only an edit changes when it was edited, not being pinned
    if (before.partial && (after.editedTimestamp === null || Date.now() - after.editedTimestamp > JUST_EDITED)) return;
    const config = await shouldLog(after.guild, 'messageEdited');
    if (!config || isIgnoredChannel(config, after.guild, after.channelId) || isIgnoredMember(config, after.member)) return;

    await sendLog(after.guild, 'messageEdited', (t) => {
      // Sent before the bot started, so it never saw what it said before, and there's nothing to compare
      const text = editedText(before.partial ? null : before.content, after.content, after.id, t);
      return {
        kind: 'updated',
        label: t('logs.labels.messageEdited'),
        where: channelRef(after.guild, after.channelId),
        about: 'user',
        subject: userSubject(after.author),
        thumbnail: avatarOf(after.member ?? after.author),
        details: text.details,
        files: text.files,
        ids: { user: after.author.id, message: after.id, channel: after.channelId },
        link: { label: t('logs.jumpToMessage'), url: after.url },
      };
    });
  },
});
