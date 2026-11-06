import type { Translate } from 'utility/i18next';

/** Time units in milliseconds. */
export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Format a duration with its two largest units, like `3d 4h`, `2h 15m` or `45m`.
 * @param ms The duration in milliseconds.
 * @param t The translation for the units.
 */
export function formatDuration(ms: number, t: Translate): string {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);

  const parts: string[] = [];
  if (days > 0) parts.push(t('duration.days', { count: days }));
  if (hours > 0) parts.push(t('duration.hours', { count: hours }));
  if (minutes > 0 && days === 0) parts.push(t('duration.minutes', { count: minutes }));

  return parts.length > 0 ? parts.slice(0, 2).join(' ') : t('duration.lessThanMinute');
}

/** Format a number with the thousands separators of the language, like `1,234` in English and `1.234` in German. */
export const formatNumber = (number: number, t: Translate, options?: Intl.NumberFormatOptions) => number.toLocaleString(t('locale'), options);

/** Numbers from here on are shortened, like 1.2k, as exact ones get hard to read in images. */
const COMPACT_FROM = 1_000;

/**
 * Format a number for images: exact below 1,000, like `999`, and shortened from there, like `1.2k`, `152k` or `1.2M`.
 * The decimal separator follows the language, and the suffixes are translatable.
 * @param t The translation for the locale and the suffixes.
 */
export function formatCompactNumber(value: number, t: Translate): string {
  const locale = t('locale');
  if (Math.abs(value) < COMPACT_FROM) return value.toLocaleString(locale);

  const [divisor, suffix] = Math.abs(value) >= 1_000_000 ? [1_000_000, t('number.million')] : [1_000, t('number.thousand')];
  const scaled = value / divisor;
  // One decimal while it still says something, like 12.3k, but not for 152k
  const digits = Math.abs(scaled) < 100 ? 1 : 0;
  return `${scaled.toLocaleString(locale, { maximumFractionDigits: digits })}${suffix}`;
}
