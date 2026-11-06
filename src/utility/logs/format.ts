import { channelMention, roleMention, time, TimestampStyles, userMention, type Guild, type GuildMember, type PartialUser, type User } from 'discord.js';

import type { Translate } from 'utility/i18next';
import type { Doer } from 'utility/logs/audit';
import { quoteText } from 'utility/logs/send';
import { code } from 'utility/text';

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

/**
 * Everything named in a log is a mention with its name in code next to it, also in the details, as a mention alone shows nothing useful
 * for what's gone or what the reader's Discord doesn't know. These look the name up, and fall back to the mention alone if it's unknown.
 */
export const channelRef = (guild: Guild, id: string) => {
  const channel = guild.channels.cache.get(id);
  return channel ? channelSubject(id, channel.name) : channelMention(id);
};

export const roleRef = (guild: Guild, id: string) => {
  const role = guild.roles.cache.get(id);
  return role ? roleSubject(id, role.name) : roleMention(id);
};

export const userRef = (guild: Guild, id: string) => userSubject(guild.client.users.cache.get(id), id);

/** The reason someone gave, as a part of the entry, or null if they gave none. */
export const reasonPart = (doer: Doer | null, t: Translate) => (doer?.reason ? `**${t('logs.reason')}**\n${quoteText(doer.reason)}` : null);

/** A date, and how long ago or from now that is, like `4 November 2026 21:14 (3 years ago)`. */
export const when = (date: Date | number | null) =>
  date ? `${time(new Date(date), TimestampStyles.ShortDateTime)} (${time(new Date(date), TimestampStyles.RelativeTime)})` : null;
