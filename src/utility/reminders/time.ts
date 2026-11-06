import { DAY, HOUR, MINUTE } from 'utility/duration';

/** How often a reminder comes back, or null for once. */
export type ReminderRepeat = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Why a time couldn't be used: it isn't one, it's in the past, or it's too far ahead. */
export type WhenError = 'invalid' | 'past' | 'tooFar';

/** The furthest ahead a reminder can be, in years. */
export const MAX_YEARS_AHEAD = 5;
/** The hour a reminder for a date without a time goes off at, in the user's own time. */
export const DEFAULT_HOUR = 9;

/** A date and time on the clock somewhere, months from 1 to 12. */
interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** What a unit adds: a fixed time, or months on the calendar, so a month from January 31 is the end of February. */
type Unit = { ms: number } | { months: number };

/** Units of durations by how they're written, in English and German. */
const UNITS: Record<string, Unit> = {};
const addUnit = (unit: Unit, ...names: string[]) => names.forEach((name) => (UNITS[name] = unit));
addUnit({ ms: MINUTE }, 'm', 'min', 'mins', 'minute', 'minutes', 'minuten');
addUnit({ ms: HOUR }, 'h', 'hr', 'hrs', 'hour', 'hours', 'std', 'stunde', 'stunden');
addUnit({ ms: DAY }, 'd', 'day', 'days', 't', 'tag', 'tage', 'tagen');
addUnit({ ms: 7 * DAY }, 'w', 'wk', 'wks', 'week', 'weeks', 'wo', 'woche', 'wochen');
addUnit({ months: 1 }, 'mo', 'month', 'months', 'monat', 'monate', 'monaten');
addUnit({ months: 12 }, 'y', 'yr', 'yrs', 'year', 'years', 'j', 'jahr', 'jahre', 'jahren');

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Add months on the calendar, keeping the time and moving days that don't exist in the new month to its last day. */
function addMonths(time: number, months: number): number {
  const date = new Date(time);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const target = new Date(Date.UTC(year, month, 1));
  const day = Math.min(date.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth() + 1));
  target.setUTCDate(day);
  target.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
  return target.getTime();
}

/**
 * Parse a duration like `10m`, `2h 30m`, `1,5 Std` or `in 3 days and 4 hours`, in English or German.
 * @returns When it ends, counted from now, or null if it isn't a duration.
 */
export function parseDuration(input: string, now: Date): Date | null {
  const text = input
    .trim()
    .toLowerCase()
    .replace(/^in\s+/, '')
    // Words and commas between the parts, like `1h and 30m` or `1 Tag, 2 Std`
    .replace(/,\s|\s(and|und)\s/g, ' ');
  if (!text) return null;

  let time = now.getTime();
  let rest = text;
  const part = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zäöü]+)\.?/;
  let match: RegExpExecArray | null;
  while ((match = part.exec(rest))) {
    const amount = Number(match[1]!.replace(',', '.'));
    const unit = UNITS[match[2]!];
    if (!unit) return null;
    if ('ms' in unit) time += amount * unit.ms;
    else {
      // Whole months on the calendar, and what's left of one as days
      const months = Math.floor(amount * unit.months);
      time = addMonths(time, months) + (amount * unit.months - months) * 30 * DAY;
    }
    rest = rest.slice(match[0].length);
  }
  return rest.trim() === '' && rest !== text ? new Date(Math.round(time)) : null;
}

/** The date and time on the clock in a timezone at a moment. */
export function getWallTime(date: Date, timezone: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
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

/** Weekdays by how they're written, in English and German, as the day of the week they are, 0 for Sunday. */
const WEEKDAYS: Record<string, number> = {};
const addWeekday = (day: number, ...names: string[]) => names.forEach((name) => (WEEKDAYS[name] = day));
addWeekday(0, 'sunday', 'sun', 'sonntag');
addWeekday(1, 'monday', 'mon', 'montag');
addWeekday(2, 'tuesday', 'tue', 'tues', 'dienstag');
addWeekday(3, 'wednesday', 'wed', 'mittwoch');
addWeekday(4, 'thursday', 'thu', 'thur', 'thurs', 'donnerstag');
addWeekday(5, 'friday', 'fri', 'freitag');
addWeekday(6, 'saturday', 'sat', 'samstag', 'sonnabend');
const WEEKDAY = new RegExp(
  `(?<![a-zäöü])(?:(?:next|this|coming|nächsten|nächster|nächste|kommenden|diesen)\\s+)?(${Object.keys(WEEKDAYS).join('|')})(?![a-zäöü])`,
);

/**
 * A date like `24.12.`, `24.12.2026`, `2026-12-24`, today, tomorrow or a weekday. The year is null when it wasn't given.
 * A weekday is the next one, today included, and `weekday` says it was one, so it can move a week on once its time passed.
 */
function parseDatePart(text: string, today: WallTime): { year: number | null; month: number; day: number; weekday?: boolean; rest: string } | null {
  const take = (match: RegExpExecArray) => text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length);

  const iso = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), rest: take(iso) };

  const dotted = /(?<![\d:])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?![\d:])/.exec(text);
  if (dotted) {
    const year = dotted[3] ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]) : null;
    return { year, month: Number(dotted[2]), day: Number(dotted[1]), rest: take(dotted) };
  }

  const word = /(?<![a-zäöü])(today|heute|tomorrow|morgen|übermorgen)(?![a-zäöü])/.exec(text);
  if (word) {
    const days = { today: 0, heute: 0, tomorrow: 1, morgen: 1, übermorgen: 2 }[word[1] as 'today'];
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), rest: take(word) };
  }

  const weekday = WEEKDAY.exec(text);
  if (weekday) {
    const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const ahead = (WEEKDAYS[weekday[1]!]! - todayDate.getUTCDay() + 7) % 7;
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + ahead));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: true, rest: take(weekday) };
  }
  return null;
}

/**
 * A time like `18:00`, `6pm`, `6:30 pm`, `18 Uhr` or, after a date, just `18`.
 * @returns The hour and minute, or null if it isn't a time.
 */
function parseTimePart(text: string, afterDate: boolean): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr|h)?$/.exec(text);
  if (!match) return null;
  const [hourText, minuteText, suffix] = [match[1]!, match[2], match[3]];
  // A lone number is only a time after a date, otherwise it's more likely a duration without its unit
  if (!minuteText && !suffix && !afterDate) return null;
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (suffix === 'am' || suffix === 'pm') {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix === 'pm' ? 12 : 0);
  }
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * Parse a date and time like `18:00`, `tomorrow 9am`, `friday 18:00`, `24.12. 18:00` or `2026-12-24`, in someone's timezone.
 * A time without a date is today, or tomorrow once it passed. A weekday is the next one, or a week later once its time passed
 * today. A date without a year is the next time it comes, and a date without a time is at 9:00.
 * @returns When it is, or why it can't be used.
 */
export function parseDateTime(input: string, now: Date, timezone: string): Date | WhenError {
  const today = getWallTime(now, timezone);
  let text = input.trim().toLowerCase();
  const date = parseDatePart(text, today);
  if (date) text = date.rest;
  // Words between the date and the time, like `on 24.12. at 18:00` or `am Freitag um 18 Uhr`
  text = text
    .replace(/(?<![\d\s])\s*(?:^|\s)(at|um|on|am)(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/^(at|um|on|am)\s+/, '');

  const time = text ? parseTimePart(text, date !== null) : null;
  if (text && !time) return 'invalid';
  if (!date && !time) return 'invalid';

  const wall: WallTime = {
    year: date?.year ?? today.year,
    month: date?.month ?? today.month,
    day: date?.day ?? today.day,
    hour: time?.hour ?? DEFAULT_HOUR,
    minute: time?.minute ?? 0,
  };
  if (wall.month < 1 || wall.month > 12 || wall.day < 1 || wall.day > daysInMonth(wall.year, wall.month)) return 'invalid';

  let result = fromWallTime(wall, timezone);
  if (result.getTime() <= now.getTime()) {
    if (!date || date.weekday) {
      // A time that already passed today is tomorrow, and a weekday whose time passed today is next week
      const later = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + (date ? 7 : 1)));
      result = fromWallTime({ ...wall, year: later.getUTCFullYear(), month: later.getUTCMonth() + 1, day: later.getUTCDate() }, timezone);
    } else if (date.year === null) {
      // A date without a year that already passed this year is next year, February 29 included when there is one
      const year = wall.year + 1;
      if (wall.day > daysInMonth(year, wall.month)) return 'invalid';
      result = fromWallTime({ ...wall, year }, timezone);
    } else return 'past';
  }
  return result;
}

/**
 * When a reminder is due, from a duration like `2h 30m` or a date and time like `tomorrow 18:00`.
 * @param timezone The user's timezone, for dates and times.
 */
export function parseWhen(input: string, now: Date, timezone: string): Date | WhenError {
  const result = parseDuration(input, now) ?? parseDateTime(input, now, timezone);
  if (typeof result === 'string') return result;
  if (result.getTime() <= now.getTime()) return 'past';
  if (result.getTime() > addMonths(now.getTime(), MAX_YEARS_AHEAD * 12)) return 'tooFar';
  return result;
}

/** The longest each repeat can be, so jumping ahead over missed ones never skips one. */
const LONGEST: Record<ReminderRepeat, number> = { daily: DAY + HOUR, weekly: 7 * DAY + HOUR, monthly: 31 * DAY + HOUR, yearly: 366 * DAY + HOUR };

/**
 * The next time a repeating reminder goes off after a moment: the same time on the clock in its timezone, a day, week,
 * month or year on from when it first went off. Counting from the first time keeps a reminder on the 31st on the last day
 * of shorter months, without moving it to the 28th for good after February.
 * @param startAt When it first went off.
 * @param after The moment it has to be after, like now.
 */
export function nextOccurrence(startAt: Date, repeat: ReminderRepeat, timezone: string, after: Date): Date {
  const start = getWallTime(startAt, timezone);
  const occurrence = (count: number): Date => {
    if (repeat === 'daily' || repeat === 'weekly') {
      const date = new Date(Date.UTC(start.year, start.month - 1, start.day + count * (repeat === 'daily' ? 1 : 7)));
      return fromWallTime({ ...start, year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }, timezone);
    }
    const months = start.month - 1 + count * (repeat === 'monthly' ? 1 : 12);
    const year = start.year + Math.floor(months / 12);
    const month = (months % 12) + 1;
    return fromWallTime({ ...start, year, month, day: Math.min(start.day, daysInMonth(year, month)) }, timezone);
  };

  // Jumps over the ones missed, like after the bot was offline for a while
  let count = Math.max(1, Math.floor((after.getTime() - startAt.getTime()) / LONGEST[repeat]));
  while (occurrence(count).getTime() <= after.getTime()) count++;
  return occurrence(count);
}
