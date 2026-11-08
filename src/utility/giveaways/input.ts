import { formatDuration, MINUTE } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { parseDuration } from 'utility/reminders/time';

/**
 * A duration typed in, like `2h 30m` or `7 Tage`, in whole minutes.
 * @returns The minutes, or null if it isn't a duration, or it's shorter than `min` or longer than `max`.
 */
export function parseMinutes(input: string, min: number, max: number, now = new Date()): number | null {
  const end = parseDuration(input, now);
  if (!end) return null;
  const minutes = Math.round((end.getTime() - now.getTime()) / MINUTE);
  return minutes >= min && minutes <= max ? minutes : null;
}

/** A whole number typed in, or null if it isn't one, or it's out of the range. */
export function parseWhole(input: string, min: number, max: number): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/** Minutes as a short duration to show, like `7d 3h`, in the language of the translation. */
export const formatMinutes = (minutes: number, t: Translate) => formatDuration(minutes * MINUTE, t);

/**
 * Minutes written out exactly, like `7d 3h 5m`, to prefill a popup with. Understood in every language, unlike {@link formatMinutes},
 * which leaves out the minutes of longer durations.
 */
export function minutesText(minutes: number): string {
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const rest = minutes % 60;
  const parts = [days ? `${days}d` : '', hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0m';
}
