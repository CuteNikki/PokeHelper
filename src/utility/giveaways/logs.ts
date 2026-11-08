import { bold, channelMention, type Guild, messageLink, userMention } from 'discord.js';

import type { Giveaway } from 'database/giveaways';

import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { sendLog, type LogKind } from 'utility/logs/send';

/** What happened to a giveaway, which is logged in the giveaways group. */
export type GiveawayLogEvent = 'giveawayStarted' | 'giveawayEnded' | 'giveawayRerolled' | 'giveawayCancelled' | 'giveawayDeleted' | 'giveawayRulesChanged';

const KINDS: Record<GiveawayLogEvent, LogKind> = {
  giveawayStarted: 'created',
  giveawayEnded: 'updated',
  giveawayRerolled: 'updated',
  giveawayCancelled: 'deleted',
  giveawayDeleted: 'deleted',
  giveawayRulesChanged: 'updated',
};

/**
 * Log something that happened to a giveaway, if the server logs it. Never throws.
 * @param byId Who did it, like who pressed End now. Null when the bot did it by itself, like when its time ran out.
 * @param details What else to say, like the winners, each its own part.
 */
export function logGiveaway(
  guild: Guild,
  event: GiveawayLogEvent,
  giveaway: Giveaway,
  byId: string | null,
  details: (t: Translate) => (string | null)[] = () => [],
) {
  return sendLog(guild, event, (t) => ({
    kind: KINDS[event],
    label: t(`logs.labels.${event}`),
    about: 'giveaway',
    subject: `${bold(giveaway.prize)}${giveaway.number ? ` ${t('giveaway.manage.number', { number: formatNumber(giveaway.number, t) })}` : ''}`,
    where: channelMention(giveaway.channelId),
    by: byId ? { id: byId, reason: null } : null,
    details: details(t),
    ids: { channel: giveaway.channelId, ...(giveaway.messageId ? { message: giveaway.messageId } : {}) },
    // A deleted one's post is gone with it
    link:
      giveaway.messageId && event !== 'giveawayDeleted'
        ? { label: t('logs.giveaways.jump'), url: messageLink(giveaway.channelId, giveaway.messageId, guild.id) }
        : undefined,
  }));
}

/** The winners as a detail of a log, or that there are none. */
export const winnersDetail = (winnerIds: string[], t: Translate) =>
  winnerIds.length > 0
    ? `${bold(t('logs.giveaways.winners', { count: winnerIds.length }))}\n${winnerIds.map(userMention).join(', ')}`
    : t('logs.giveaways.noWinners');
