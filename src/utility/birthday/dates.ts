/** The hour, in a member's own time, from which their birthday is announced. */
export const ANNOUNCEMENT_HOUR = 8;

/** The date and hour it is in a timezone. */
export interface LocalTime {
  year: number;
  /** 1 to 12. */
  month: number;
  day: number;
  hour: number;
}

/**
 * The date and hour it is in a timezone, falling back to UTC for unknown or missing ones.
 * @param timezone An IANA timezone, like `Europe/Berlin`.
 */
export function getLocalTime(now: Date, timezone: string | null): LocalTime {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timezone ?? 'UTC');
  } catch {
    parts = format('UTC');
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour') };
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Whether it's someone's birthday on a local date. Birthdays on February 29 are celebrated on February 28 in other years.
 * @param birthday The birthday, stored as midnight UTC of the date.
 */
export function isBirthdayOn(birthday: Date, local: Pick<LocalTime, 'year' | 'month' | 'day'>): boolean {
  const month = birthday.getUTCMonth() + 1;
  let day = birthday.getUTCDate();
  if (month === 2 && day === 29 && !isLeapYear(local.year)) day = 28;
  return local.month === month && local.day === day;
}

/** The age someone turns on their birthday in a year. */
export const ageInYear = (birthday: Date, year: number) => year - birthday.getUTCFullYear();

/** What should happen for a birthday right now. */
export interface BirthdayActions {
  /** Give the birthday role, as it's their birthday and they haven't gotten it this year. */
  giveRole: boolean;
  /** Announce the birthday, as it's their birthday, the announcement hour has come and it wasn't announced this year. */
  announce: boolean;
  /** Take the birthday role away again, as their birthday is over. */
  removeRole: boolean;
  /** The year it is for the member, to remember what was done. */
  year: number;
}

/**
 * Work out what's due for a birthday. Checked regularly instead of at fixed times, so nothing is missed while the bot was offline:
 * a late announcement still happens that day, and the role is removed whenever the bot runs after the birthday.
 * @param state What was already done: the year the role was given and the birthday announced, and whether the role is still on.
 */
export function getBirthdayActions(
  birthday: { date: Date; timezone: string | null },
  state: { roleYear: number | null; announcedYear: number | null; roleActive: boolean },
  now: Date,
): BirthdayActions {
  const local = getLocalTime(now, birthday.timezone);
  const today = isBirthdayOn(birthday.date, local);

  return {
    giveRole: today && state.roleYear !== local.year,
    announce: today && local.hour >= ANNOUNCEMENT_HOUR && state.announcedYear !== local.year,
    removeRole: !today && state.roleActive,
    year: local.year,
  };
}

/** The earliest birth year that's taken, to catch typos like 1026. */
const EARLIEST_YEAR = 1900;

/**
 * Parse a birthday typed like `2000-05-01` or the way German speakers write it, `01.05.2000`. Dates that don't exist, like
 * February 31, aren't rolled over into the next month, and the year has to be written in full and can't be in the future.
 * @returns The birthday at midnight UTC, or null if it isn't a valid one.
 */
export function parseBirthday(input: string, now: Date): Date | null {
  const text = input.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const parts = iso ? [iso[1], iso[2], iso[3]] : dotted ? [dotted[3], dotted[2], dotted[1]] : null;
  if (!parts) return null;
  const [year, month, day] = parts.map(Number) as [number, number, number];

  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls days and months that don't exist over, like February 31 into March
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < EARLIEST_YEAR || date.getTime() > now.getTime()) return null;
  return date;
}

/** The timezone with the case it's known by, like `Europe/Berlin` for `europe/berlin`, or null if there's no such timezone. */
export function resolveTimezone(input: string): string | null {
  const wanted = input.trim().toLowerCase();
  return Intl.supportedValuesOf('timeZone').find((timezone) => timezone.toLowerCase() === wanted) ?? null;
}
