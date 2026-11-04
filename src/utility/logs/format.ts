import { time, TimestampStyles, userMention, type PartialUser, type User } from 'discord.js';

import type { Translate } from 'utility/i18next';
import type { Doer } from 'utility/logs/audit';
import { quoteText } from 'utility/logs/send';

/** Someone as they're shown in logs: a mention, which may not show a name for someone who left, and their username to be sure. */
export const who = (user: User | PartialUser | null | undefined, id?: string) =>
  user?.username ? `${userMention(user.id)} (${user.username})` : userMention(user?.id ?? id ?? '0');

/** ` · by @mod`, when the audit log says who did it, with their reason if they gave one. Empty when it doesn't. */
export const byLine = (doer: Doer | null, t: Translate) => (doer ? ` · ${t('logs.by', { user: userMention(doer.id) })}` : '');

/** The reason someone gave, as a part of the entry, or null if they gave none. */
export const reasonPart = (doer: Doer | null, t: Translate) => (doer?.reason ? `**${t('logs.reason')}**\n${quoteText(doer.reason)}` : null);

/** A date as how long ago it was, like `3 years ago`. */
export const ago = (date: Date | number | null) => (date ? time(new Date(date), TimestampStyles.RelativeTime) : null);
