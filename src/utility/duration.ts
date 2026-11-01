import { t } from 'i18next';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format a duration with its two largest units, like `3d 4h`, `2h 15m` or `45m`.
 * @param ms The duration in milliseconds.
 */
export function formatDuration(ms: number): string {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);

  const parts: string[] = [];
  if (days > 0) parts.push(t('duration.days', { count: days }));
  if (hours > 0) parts.push(t('duration.hours', { count: hours }));
  if (minutes > 0 && days === 0) parts.push(t('duration.minutes', { count: minutes }));

  return parts.length > 0 ? parts.slice(0, 2).join(' ') : t('duration.lessThanMinute');
}

/** Format a number with thousands separators, like `1,234`. */
export const formatNumber = (number: number) => number.toLocaleString('en-US');
