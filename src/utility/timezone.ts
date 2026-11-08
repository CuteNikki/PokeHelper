import { HOUR, MINUTE } from 'utility/duration';

/** A date and time on the clock somewhere, months from 1 to 12. */
export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The date and time on the clock in an IANA timezone at a moment, falling back to UTC for unknown or missing ones. */
export function getWallTime(date: Date, timezone: string | null): WallTime {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timezone ?? 'UTC');
  } catch {
    parts = format('UTC');
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') };
}

/** How far a timezone is ahead of UTC at a moment, in milliseconds. */
function offsetAt(time: number, timezone: string): number {
  const wall = getWallTime(new Date(time), timezone);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - Math.floor(time / MINUTE) * MINUTE;
}

/**
 * The moment a time on the clock is in a timezone. Times skipped when the clocks go forward come out an hour later,
 * and times that happen twice when they go back are the first one.
 */
export function fromWallTime(wall: WallTime, timezone: string): Date {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // The offsets around it, which differ when the clocks change that day
  const offsets = [offsetAt(asUtc - 12 * HOUR, timezone), offsetAt(asUtc + 12 * HOUR, timezone)];
  const matches = offsets
    .map((offset) => asUtc - offset)
    .filter((time) => {
      const check = getWallTime(new Date(time), timezone);
      return check.year === wall.year && check.month === wall.month && check.day === wall.day && check.hour === wall.hour && check.minute === wall.minute;
    });
  // The first of the times it's on the clock, or, for a time that's skipped, as far after the change as it was meant to be before
  return new Date(matches.length > 0 ? Math.min(...matches) : asUtc - Math.min(...offsets));
}

/**
 * The timezone in its proper case, like `Europe/Berlin` for `europe/berlin`, or null. Spaces work like underscores, and older names
 * Intl still knows, like `Asia/Calcutta`, count too although they aren't in its list.
 */
export function resolveTimezone(input: string): string | null {
  const wanted = input.trim().replace(/\s+/g, '_');
  if (!wanted) return null;
  const listed = Intl.supportedValuesOf('timeZone').find((timezone) => timezone.toLowerCase() === wanted.toLowerCase());
  if (listed) return listed;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: wanted }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
