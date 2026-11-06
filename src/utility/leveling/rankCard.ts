import { createCanvas, type Image } from '@napi-rs/canvas';

import { drawAvatar, drawPokeball, fitFontSize, truncateText } from 'utility/canvas';
import { formatCompactNumber, formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';

/** A member's level progress, all-time or weekly. */
export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpRequired: number;
  rank: number;
}

export interface RankCardData {
  displayName: string;
  username: string;
  avatar: Image | null;
  allTime: LevelProgress;
  weekly: LevelProgress;
}

const WIDTH = 880;
const HEIGHT = 200;
const PADDING = 36;
const AVATAR_RADIUS = 64;

const COLORS = {
  cardBg: 'rgba(42, 43, 60, 0.85)',
  trackBg: '#1e1e2e',
  // White, so the Pokéball's red stands out instead of clashing with the bar
  progress: '#ffffff',
  textWhite: '#ffffff',
  textGray: '#a6adc8',
};

/**
 * Draw a member's rank card: avatar, name, all-time and weekly rank, a progress bar for the all-time level, and both levels' XP.
 * @param t The translation for the labels.
 * @returns The card as a PNG.
 */
export function renderRankCard(data: RankCardData, t: Translate): Buffer {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  // Big ranks and XP are shortened, like 12.3k. The text option and the alt text have the exact numbers
  const compact = (value: number) => formatCompactNumber(value, t);

  // Card
  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, HEIGHT, 16);
  ctx.fill();

  // Avatar
  const avatarX = PADDING + AVATAR_RADIUS;
  drawAvatar(ctx, data.avatar, avatarX, HEIGHT / 2, AVATAR_RADIUS);

  const contentX = avatarX + AVATAR_RADIUS + 30;
  const rightX = WIDTH - PADDING;

  // Ranks, right-aligned in two columns, all-time on the far right
  const allTimeColX = rightX;
  const weeklyColX = rightX - 130;
  const weeklyRank = `#${compact(data.weekly.rank)}`;

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  ctx.font = 'bold 13px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(t('leveling.rank.all').toUpperCase(), allTimeColX, 46);
  ctx.fillText(t('leveling.rank.weekly').toUpperCase(), weeklyColX, 46);

  ctx.font = 'bold 36px "Roboto"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(`#${compact(data.allTime.rank)}`, allTimeColX, 86);

  ctx.font = 'bold 30px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(weeklyRank, weeklyColX, 86);
  // The name may use the space up to the weekly rank
  const nameMaxWidth = weeklyColX - ctx.measureText(weeklyRank).width - 24 - contentX;

  // Name and username
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px "Roboto", "EmojiFallback"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(truncateText(ctx, data.displayName, nameMaxWidth), contentX, 64);

  ctx.font = '18px "Roboto", "EmojiFallback"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(truncateText(ctx, `@${data.username}`, nameMaxWidth), contentX, 92);

  // Progress bar for the all-time level
  const barY = 114;
  const barW = rightX - contentX;
  const barH = 20;

  ctx.fillStyle = COLORS.trackBg;
  ctx.beginPath();
  ctx.roundRect(contentX, barY, barW, barH, barH / 2);
  ctx.fill();

  const progress = Math.max(0, Math.min(data.allTime.xpIntoLevel / data.allTime.xpRequired, 1));
  if (progress > 0) {
    ctx.fillStyle = COLORS.progress;
    ctx.beginPath();
    ctx.roundRect(contentX, barY, Math.max(barH, barW * progress), barH, barH / 2);
    ctx.fill();
  }
  // A Pokéball at the tip of the bar, rolling along as the level fills up
  drawPokeball(ctx, contentX + Math.max(barH, barW * progress) - barH / 2, barY + barH / 2, 15);

  // XP of both levels, shrunk if big numbers would make them overlap
  const levelLabel = t('leveling.rank.level').toUpperCase();
  const xpLabel = t('leveling.rank.exp').toUpperCase();
  const statsText = (label: string, progress: LevelProgress) =>
    `${label}: ${levelLabel} ${formatNumber(progress.level, t)}  |  ${compact(progress.xpIntoLevel)}/${compact(progress.xpRequired)} ${xpLabel}`;
  const allTimeStats = statsText(t('leveling.rank.all').toUpperCase(), data.allTime);
  const weeklyStats = statsText(t('leveling.rank.weekly').toUpperCase(), data.weekly);

  const statsFont = (size: number) => `${size}px "Roboto"`;
  ctx.font = statsFont(fitFontSize(ctx, statsFont, [allTimeStats, weeklyStats], barW - 40, 17, 12));
  ctx.fillStyle = COLORS.textGray;
  const statsY = 168;
  ctx.fillText(allTimeStats, contentX, statsY);
  ctx.textAlign = 'right';
  ctx.fillText(weeklyStats, rightX, statsY);

  return canvas.toBuffer('image/png');
}
