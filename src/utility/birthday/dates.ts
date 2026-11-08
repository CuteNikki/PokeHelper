import { getWallTime, type WallTime } from 'utility/timezone';
/** The hour, in a member's own time, from which their birthday is announced. */
const ANNOUNCEMENT_HOUR = 8;

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Whether it's someone's birthday on a local date. Birthdays on February 29 count on February 28 in other years. */
export function isBirthdayOn(birthday: Date, local: Pick<WallTime, 'year' | 'month' | 'day'>): boolean {
  const month = birthday.getUTCMonth() + 1;
  let day = birthday.getUTCDate();
  if (month === 2 && day === 29 && !isLeapYear(local.year)) day = 28;
  return local.month === month && local.day === day;
}

/** The age someone turns on their birthday in a year. */
export const ageInYear = (birthday: Date, year: number) => year - birthday.getUTCFullYear();

/** What should happen for a birthday right now. */
export interface BirthdayActions {
  giveRole: boolean;
  announce: boolean;
  removeRole: boolean;
  /** The year it is for the member, to remember what was done. */
  year: number;
}

/**
 * Work out what's due for a birthday. Checked regularly instead of at fixed times, so a late announcement still happens that day
 * and the role is removed whenever the bot runs after the birthday.
 */
export function getBirthdayActions(
  birthday: { date: Date; timezone: string | null },
  state: { roleYear: number | null; announcedYear: number | null; roleActive: boolean },
  now: Date,
): BirthdayActions {
  const local = getWallTime(now, birthday.timezone);
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
 * Parse `2000-05-01` or the German `01.05.2000` into midnight UTC. Dates that don't exist, short years and future dates give null.
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
