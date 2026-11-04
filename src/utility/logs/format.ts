import { channelMention, inlineCode, roleMention, time, TimestampStyles, userMention, type GuildMember, type PartialUser, type User } from 'discord.js';

import type { Translate } from 'utility/i18next';
import type { Doer } from 'utility/logs/audit';
import { quoteText } from 'utility/logs/send';

/** A name in code, so whatever it's called can't turn into formatting, like a name with stars or underscores. */
export const code = (text: string) => inlineCode(text.replace(/`/g, 'ˋ'));

/**
 * Someone as they're shown in logs: a mention, to open their profile, and their username in code, as a mention only shows
 * a name for people the reader's Discord knows.
 */
export const userSubject = (user: User | PartialUser | null | undefined, id?: string) => {
  const userId = user?.id ?? id ?? '0';
  return user?.username ? `${userMention(userId)} ${code(user.username)}` : userMention(userId);
};

/** Someone's picture: their server avatar if they have one, or their own. */
export const avatarOf = (who: User | PartialUser | GuildMember | null | undefined) =>
  who && 'displayAvatarURL' in who ? who.displayAvatarURL({ size: 128 }) : null;

/** A channel that still exists: a mention to go there, and its name. */
export const channelSubject = (id: string, name: string) => `${channelMention(id)} ${code(`#${name}`)}`;

/** A role that still exists: a mention, and its name. */
export const roleSubject = (id: string, name: string) => `${roleMention(id)} ${code(`@${name}`)}`;

/** The reason someone gave, as a part of the entry, or null if they gave none. */
export const reasonPart = (doer: Doer | null, t: Translate) => (doer?.reason ? `**${t('logs.reason')}**\n${quoteText(doer.reason)}` : null);

/** A date as how long ago it was, like `3 years ago`. */
export const ago = (date: Date | number | null) => (date ? time(new Date(date), TimestampStyles.RelativeTime) : null);
