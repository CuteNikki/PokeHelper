import type { ThemeName } from './themes';

/**
 * Which theme the bot wears on a day. Holidays come first, then the season, so every day of the year has one. Days are counted in UTC,
 * so the bot switches at the same moment wherever it runs.
 */

/** Easter Sunday of a year, by the usual way of working it out for the Gregorian calendar. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The theme for a day.
 * @param birthday When the bot was made, whose day of the year is its birthday, or null to leave it out.
 */
export function themeOn(date: Date, birthday: Date | null): ThemeName {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day);
  const easter = easterSunday(date.getUTCFullYear()).getTime();

  if (birthday && birthday.getUTCMonth() + 1 === month && birthday.getUTCDate() === day) return 'birthday';
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'newYear';
  if (month === 2 && day >= 13 && day <= 15) return 'valentines';
  // Holy Week, from Palm Sunday, and Easter Monday
  if (today >= easter - 7 * DAY && today <= easter + DAY) return 'easter';
  if (month === 10) return 'halloween';
  if (month === 12) return 'christmas';
  if (month === 6) return 'pride';

  // The bot's own look between the seasons, in the first half of the month each one starts, or right after the holiday that starts it
  if ([1, 3, 7, 9].includes(month) && day <= 15) return 'standard';

  if (month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}
