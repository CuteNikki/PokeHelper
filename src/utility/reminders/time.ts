import { DAY, HOUR } from 'utility/duration';
import { getVocabulary, type Vocabulary } from 'utility/reminders/words';
import { fromWallTime, getWallTime, type WallTime } from 'utility/timezone';

/** How often a reminder comes back, or null for once. */
export type ReminderRepeat = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Why a time couldn't be used: it isn't one, it's in the past, or it's too far ahead. */
export type WhenError = 'invalid' | 'past' | 'tooFar';

/** The furthest ahead a reminder can be, in years. */
export const MAX_YEARS_AHEAD = 5;
/** The hour a reminder for a date without a time goes off at, in the user's own time. */
export const DEFAULT_HOUR = 9;

/** Words of the vocabulary for a regular expression, the longest first, so `friday` is tried before `fri`. */
const alternatives = (words: Iterable<string>) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

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
 * Parse a duration like `10m`, `2h 30m`, `1,5 Std` or `in 3 days and 4 hours`, with the units of any language.
 * @returns When it ends, counted from now, or null if it isn't a duration.
 */
export function parseDuration(input: string, now: Date, words: Vocabulary = getVocabulary()): Date | null {
  // Commas and joining words between the parts, like `1h and 30m` or `1 Tag, 2 Std`, and a word in front, like `in`
  const tokens = input
    .trim()
    .toLowerCase()
    .replace(/,(?!\d)/g, ' ')
    .split(/\s+/)
    .filter((token, index) => token && !words.joiners.has(token) && !(index === 0 && words.durationPrefixes.has(token)));
  const text = tokens.join(' ');
  if (!text) return null;

  let time = now.getTime();
  let rest = text;
  const part = /^\s*(\d+(?:[.,]\d+)?)\s*(\p{L}+)\.?/u;
  let match: RegExpExecArray | null;
  while ((match = part.exec(rest))) {
    const amount = Number(match[1]!.replace(',', '.'));
    const unit = words.units.get(match[2]!);
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

/** A date found in what was typed, and what's left of it. The year is null when it wasn't given. */
interface DatePart {
  year: number | null;
  month: number;
  day: number;
  /** Whether it was a weekday, which moves a week on once its time passed today. */
  weekday?: boolean;
  rest: string;
}

/**
 * A date like `24.12.`, `24.12.2026`, `2026-12-24`, a day counted from today like `tomorrow`, or a weekday, which is the next one,
 * today included.
 */
function parseDatePart(text: string, today: WallTime, words: Vocabulary): DatePart | null {
  const take = (match: RegExpExecArray) => text.slice(0, match.index) + ' ' + text.slice(match.index + match[0].length);
  const fromToday = (days: number) => new Date(Date.UTC(today.year, today.month - 1, today.day + days));
  const asPart = (date: Date, match: RegExpExecArray, weekday?: boolean): DatePart => ({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday,
    rest: take(match),
  });

  const iso = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(text);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]), rest: take(iso) };

  const dotted = /(?<![\d:])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?![\d:])/.exec(text);
  if (dotted) {
    const year = dotted[3] ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]) : null;
    return { year, month: Number(dotted[2]), day: Number(dotted[1]), rest: take(dotted) };
  }

  if (words.relativeDays.size > 0) {
    const relative = new RegExp(`(?<!\\p{L})(${alternatives(words.relativeDays.keys())})(?!\\p{L})`, 'u').exec(text);
    if (relative) return asPart(fromToday(words.relativeDays.get(relative[1]!)!), relative);
  }

  if (words.weekdays.size > 0) {
    const prefixes = words.weekdayPrefixes.size > 0 ? `(?:(?:${alternatives(words.weekdayPrefixes)})\\s+)?` : '';
    const weekday = new RegExp(`(?<!\\p{L})${prefixes}(${alternatives(words.weekdays.keys())})(?!\\p{L})`, 'u').exec(text);
    if (weekday) {
      const ahead = (words.weekdays.get(weekday[1]!)! - fromToday(0).getUTCDay() + 7) % 7;
      return asPart(fromToday(ahead), weekday, true);
    }
  }
  return null;
}

/**
 * A time like `18:00`, `6pm`, `6:30 pm`, `18 Uhr` or, after a date, just `18`.
 * @returns The hour and minute, or null if it isn't a time.
 */
function parseTimePart(text: string, afterDate: boolean, words: Vocabulary): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(\p{L}+)?$/u.exec(text);
  if (!match) return null;
  const [hourText, minuteText, suffix] = [match[1]!, match[2], match[3]];
  const half = suffix && words.am.has(suffix) ? 'am' : suffix && words.pm.has(suffix) ? 'pm' : null;
  if (suffix && !half && !words.hourSuffixes.has(suffix)) return null;
  // A lone number is only a time after a date, otherwise it's more likely a duration without its unit
  if (!minuteText && !suffix && !afterDate) return null;
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'pm' ? 12 : 0);
  }
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * Parse a date and time like `18:00`, `tomorrow 9am`, `friday 18:00`, `24.12. 18:00` or `2026-12-24`, in someone's timezone,
 * with the words of any language. A time without a date is today, or tomorrow once it passed. A weekday is the next one, or a week
 * later once its time passed today. A date without a year is the next time it comes, and a date without a time is at 9:00.
 * @returns When it is, or why it can't be used.
 */
export function parseDateTime(input: string, now: Date, timezone: string, words: Vocabulary = getVocabulary()): Date | WhenError {
  const today = getWallTime(now, timezone);
  let text = input.trim().toLowerCase();
  const date = parseDatePart(text, today, words);
  if (date) text = date.rest;
  // Words around the date and time, like `on 24.12. at 18:00` or `am Freitag um 18 Uhr`. One that's also am or pm right after
  // a number, like `am` in `6 am`, is part of the time instead
  const tokens = text.split(/\s+/).filter(Boolean);
  const isHalf = (token: string, index: number) => /\d$/.test(tokens[index - 1] ?? '') && (words.am.has(token) || words.pm.has(token));
  text = tokens.filter((token, index) => !words.connectors.has(token) || isHalf(token, index)).join(' ');

  const time = text ? parseTimePart(text, date !== null, words) : null;
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
export function parseWhen(input: string, now: Date, timezone: string, words: Vocabulary = getVocabulary()): Date | WhenError {
  const result = parseDuration(input, now, words) ?? parseDateTime(input, now, timezone, words);
  if (typeof result === 'string') return result;
  // Numbers too big for a date, like 99999999999 years, make an invalid one, which no comparison catches
  if (Number.isNaN(result.getTime())) return 'tooFar';
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
