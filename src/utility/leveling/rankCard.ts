import { createCanvas, type Image } from '@napi-rs/canvas';

import type { LevelPeriod } from 'database/leveling';

import { drawAvatar, drawPokeball, fitFontSize, truncateText } from 'utility/canvas';
import { formatCompactNumber, formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';

/** A member's level progress, all-time, weekly or monthly. */
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
  /** The period the card shows, which the button below it switches. */
  period: LevelPeriod;
  progress: LevelProgress;
}

/** The label above the rank, for each period. */
const PERIOD_LABEL_KEYS = {
  allTime: 'leveling.rank.all',
  weekly: 'leveling.rank.weekly',
  monthly: 'leveling.rank.monthly',
} as const satisfies Record<LevelPeriod, string>;

const WIDTH = 700;
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
 * Draw a member's rank card for one period: avatar, name, rank, a progress bar for the level, and the level's XP.
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

  // Rank on the far right, with the period above it
  const rank = `#${compact(data.progress.rank)}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  ctx.font = 'bold 13px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  const periodLabel = t(PERIOD_LABEL_KEYS[data.period]).toUpperCase();
  ctx.fillText(periodLabel, rightX, 46);
  const periodLabelWidth = ctx.measureText(periodLabel).width;

  ctx.font = 'bold 36px "Roboto"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(rank, rightX, 86);
  // The name may use the space up to the rank or its label, whichever is wider
  const nameMaxWidth = rightX - Math.max(ctx.measureText(rank).width, periodLabelWidth) - 24 - contentX;

  // Name and username
  ctx.textAlign = 'left';
  ctx.font = 'bold 30px "Roboto", "EmojiFallback"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(truncateText(ctx, data.displayName, nameMaxWidth), contentX, 64);

  ctx.font = '18px "Roboto", "EmojiFallback"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(truncateText(ctx, `@${data.username}`, nameMaxWidth), contentX, 92);

  // Progress bar for the level
  const barY = 114;
  const barW = rightX - contentX;
  const barH = 20;

  ctx.fillStyle = COLORS.trackBg;
  ctx.beginPath();
  ctx.roundRect(contentX, barY, barW, barH, barH / 2);
  ctx.fill();

  const progress = Math.max(0, Math.min(data.progress.xpIntoLevel / data.progress.xpRequired, 1));
  if (progress > 0) {
    ctx.fillStyle = COLORS.progress;
    ctx.beginPath();
    ctx.roundRect(contentX, barY, Math.max(barH, barW * progress), barH, barH / 2);
    ctx.fill();
  }
  // A Pokéball at the tip of the bar, rolling along as the level fills up
  drawPokeball(ctx, contentX + Math.max(barH, barW * progress) - barH / 2, barY + barH / 2, 15);

  // The level under the start of the bar and its XP under the end, shrunk if big numbers would make them overlap
  const levelText = `${t('leveling.rank.level').toUpperCase()} ${formatNumber(data.progress.level, t)}`;
  const xpText = `${compact(data.progress.xpIntoLevel)}/${compact(data.progress.xpRequired)} ${t('leveling.rank.exp').toUpperCase()}`;

  const statsFont = (size: number) => `${size}px "Roboto"`;
  ctx.font = statsFont(fitFontSize(ctx, statsFont, [levelText, xpText], barW - 40, 17, 12));
  ctx.fillStyle = COLORS.textGray;
  const statsY = 168;
  ctx.fillText(levelText, contentX, statsY);
  ctx.textAlign = 'right';
  ctx.fillText(xpText, rightX, statsY);

  return canvas.toBuffer('image/png');
}
