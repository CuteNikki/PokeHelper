import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Guild, MessageFlags, type InteractionEditReplyOptions, type User } from 'discord.js';

import { getLevelFromXP, getUserLevelingData, getUserRank, getXPForLevel, type LevelPeriod } from 'database/leveling';

import { loadAvatar } from 'utility/canvas';
import { formatNumber } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import type { Translate } from 'utility/i18next';
import { nextPeriod, parsePeriodCode, PERIOD_CODES } from 'utility/leveling/leaderboardView';
import { renderRankCard, type LevelProgress } from 'utility/leveling/rankCard';
import { imageWithDescription } from 'utility/response';

/** Custom IDs of the rank card's period button are `rank:<user>:<a|w|m>`, with the period it switches to. */
export const RANK_CUSTOM_ID_PREFIX = 'rank:';

/** The user and period of a rank card's period button, or null if it isn't one. */
export function parseRankCustomId(customId: string): { userId: string; period: LevelPeriod } | null {
  if (!customId.startsWith(RANK_CUSTOM_ID_PREFIX)) return null;
  const [userId, code] = customId.slice(RANK_CUSTOM_ID_PREFIX.length).split(':');
  const period = parsePeriodCode(code);
  return userId && period ? { userId, period } : null;
}

/** The plain text of each period's progress, for the card's alt text. */
const PLAIN_KEYS = {
  allTime: 'leveling.rank.text.allTimePlain',
  weekly: 'leveling.rank.text.weeklyPlain',
  monthly: 'leveling.rank.text.monthlyPlain',
} as const satisfies Record<LevelPeriod, string>;

/** A member's level progress in a period, at the same place as on the leaderboard, where ties are ordered too. */
export async function getPeriodProgress(guildId: string, userId: string, period: LevelPeriod): Promise<LevelProgress & { xp: number }> {
  const [data, rank] = await Promise.all([getUserLevelingData(guildId, userId, period), getUserRank(guildId, userId, period)]);
  const xp = data?.xp ?? 0;
  const level = getLevelFromXP(xp);
  const currentLevelXP = getXPForLevel(level);
  return { xp, level, rank, xpIntoLevel: xp - currentLevelXP, xpRequired: getXPForLevel(level + 1) - currentLevelXP };
}

/** The values of a progress line, formatted for the language. */
export function progressValues(progress: LevelProgress & { xp: number }, t: Translate) {
  return {
    level: formatNumber(progress.level, t),
    rank: formatNumber(progress.rank, t),
    xpIntoLevel: formatNumber(progress.xpIntoLevel, t),
    xpRequired: formatNumber(progress.xpRequired, t),
    xp: formatNumber(progress.xp, t),
  };
}

/**
 * Build someone's rank card for a period as a Components V2 message, with a button switching to the next of all-time, weekly and monthly.
 * @param t The translation, for whoever opened the card or switched it.
 */
export async function buildRankCard(guild: Guild, user: User, period: LevelPeriod, t: Translate): Promise<InteractionEditReplyOptions> {
  const member = guild.members.cache.get(user.id) ?? (await guild.members.fetch(user.id).catch(() => null));
  const displayName = member?.displayName || user.displayName || user.username;

  const [progress, avatar] = await Promise.all([
    getPeriodProgress(guild.id, user.id, period),
    loadAvatar(user.displayAvatarURL({ extension: 'png', size: 256 })),
  ]);
  const image = renderRankCard({ displayName, username: user.username, avatar, period, progress }, t);
  const description = t('leveling.rank.altText', { user: displayName, progress: t(PLAIN_KEYS[period], progressValues(progress, t)) });
  const { gallery, file } = imageWithDescription('rank-card.png', image, description);

  const next = nextPeriod(period);
  const periodButton = new ButtonBuilder()
    .setCustomId(`${RANK_CUSTOM_ID_PREFIX}${user.id}:${PERIOD_CODES[next]}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji(buttonIcon('calendar'))
    .setLabel(t(`leveling.leaderboard.showPeriod.${next}`));

  return {
    components: [gallery, new ActionRowBuilder<ButtonBuilder>().addComponents(periodButton)],
    files: [file],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { parse: [] },
  };
}
