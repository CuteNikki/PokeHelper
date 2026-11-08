import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Guild,
  MessageFlags,
  userMention,
  type InteractionEditReplyOptions,
  type User,
} from 'discord.js';

import { getLevelFromXP, getUserLevelingData, getUserRank, getXPForLevel, type LevelPeriod } from 'database/leveling';

import { loadAvatar } from 'utility/canvas';
import { findMember } from 'utility/discord';
import { formatNumber } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { nextPeriod, parsePeriodCode, PERIOD_CODES } from 'utility/leveling/leaderboardView';
import { renderRankCard, type LevelProgress } from 'utility/leveling/rankCard';
import { createResponse, imageWithDescription } from 'utility/response';

/** What a rank message shows: one period's card, or all periods as text. */
export interface RankView {
  /** The period of the card, which the text keeps, so switching back shows the same one. */
  period: LevelPeriod;
  /** Shown as text instead of an image. */
  text: boolean;
}

/**
 * Custom IDs of the rank message's buttons are `rank:<user>:<a|w|m>:<i|t>`, with the view they lead to, so they work however old
 * the message is. Ones without the last part are from before the text button and lead to the card.
 */
export const RANK_CUSTOM_ID_PREFIX = 'rank:';

const rankCustomId = (userId: string, view: RankView) => `${RANK_CUSTOM_ID_PREFIX}${userId}:${PERIOD_CODES[view.period]}:${view.text ? 't' : 'i'}`;

/** The user and view of a rank message's button, or null if it isn't one. */
export function parseRankCustomId(customId: string): { userId: string; view: RankView } | null {
  if (!customId.startsWith(RANK_CUSTOM_ID_PREFIX)) return null;
  const [userId, code, mode = 'i'] = customId.slice(RANK_CUSTOM_ID_PREFIX.length).split(':');
  const period = parsePeriodCode(code);
  if (!userId || !period || (mode !== 'i' && mode !== 't')) return null;
  return { userId, view: { period, text: mode === 't' } };
}

/** The plain text of each period's progress, for the card's alt text. */
const PLAIN_KEYS = {
  allTime: 'leveling.rank.text.allTimePlain',
  weekly: 'leveling.rank.text.weeklyPlain',
  monthly: 'leveling.rank.text.monthlyPlain',
} as const satisfies Record<LevelPeriod, string>;

/** A member's level progress in a period, at the same place as on the leaderboard, where ties are ordered too. */
async function getPeriodProgress(guildId: string, userId: string, period: LevelPeriod): Promise<LevelProgress & { xp: number }> {
  const [data, rank] = await Promise.all([getUserLevelingData(guildId, userId, period), getUserRank(guildId, userId, period)]);
  const xp = data?.xp ?? 0;
  const level = getLevelFromXP(xp);
  const currentLevelXP = getXPForLevel(level);
  return { xp, level, rank, xpIntoLevel: xp - currentLevelXP, xpRequired: getXPForLevel(level + 1) - currentLevelXP };
}

/** The values of a progress line, formatted for the language. */
function progressValues(progress: LevelProgress & { xp: number }, t: Translate) {
  return {
    level: formatNumber(progress.level, t),
    rank: formatNumber(progress.rank, t),
    xpIntoLevel: formatNumber(progress.xpIntoLevel, t),
    xpRequired: formatNumber(progress.xpRequired, t),
    xp: formatNumber(progress.xp, t),
  };
}

/** The button switching between the card and the text, keeping the period. */
function modeButton(userId: string, view: RankView, t: Translate) {
  return new ButtonBuilder()
    .setCustomId(rankCustomId(userId, { ...view, text: !view.text }))
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(view.text ? buttonIcon('image') : buttonIcon('file-text'))
    .setLabel(t(view.text ? 'leveling.leaderboard.showImage' : 'leveling.leaderboard.showText'));
}

/**
 * Build someone's rank as a Components V2 message: one period's card with buttons switching to the next of all-time, weekly and monthly
 * and to text, or all three periods as text, like for screen readers, with a button back to the card.
 * @param t The translation, for whoever opened the rank or switched it.
 */
export async function buildRank(guild: Guild, user: User, view: RankView, t: Translate): Promise<InteractionEditReplyOptions> {
  if (view.text) {
    const progress = (period: LevelPeriod) => getPeriodProgress(guild.id, user.id, period);
    const [allTime, weekly, monthly] = await Promise.all([progress('allTime'), progress('weekly'), progress('monthly')]);
    const content = [
      t('leveling.rank.text.title', { user: userMention(user.id) }),
      t('leveling.rank.text.allTime', progressValues(allTime, t)),
      t('leveling.rank.text.weekly', progressValues(weekly, t)),
      t('leveling.rank.text.monthly', progressValues(monthly, t)),
    ].join('\n');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(modeButton(user.id, view, t));
    const response = createResponse(content, 'info');
    // Without attachments, so the card is taken off when switching to text
    return { ...response, components: [...(response.components ?? []), row], attachments: [], allowedMentions: { parse: [] } };
  }

  const member = await findMember(guild, user.id);
  const displayName = member?.displayName || user.displayName || user.username;

  const [progress, avatar] = await Promise.all([
    getPeriodProgress(guild.id, user.id, view.period),
    loadAvatar(user.displayAvatarURL({ extension: 'png', size: 256 })),
  ]);
  const image = renderRankCard({ displayName, username: user.username, avatar, period: view.period, progress }, t);
  const description = t('leveling.rank.altText', { user: displayName, progress: t(PLAIN_KEYS[view.period], progressValues(progress, t)) });
  const { gallery, file } = imageWithDescription('rank-card.png', image, description);

  const next = nextPeriod(view.period);
  const periodButton = new ButtonBuilder()
    .setCustomId(rankCustomId(user.id, { ...view, period: next }))
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(buttonIcon('calendar'))
    .setLabel(t(`leveling.leaderboard.showPeriod.${next}`));

  return {
    components: [gallery, new ActionRowBuilder<ButtonBuilder>().addComponents(periodButton, modeButton(user.id, view, t))],
    // Replacing the card of the period switched from, if there is one
    attachments: [],
    files: [file],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  };
}
