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

/** A stretch of days with the same theme. */
export interface ThemeStretch {
  theme: ThemeName;
  /** The first and the last day, at midnight UTC. */
  from: Date;
  to: Date;
  days: number;
}

/**
 * The themes over the coming days, from today, as stretches of the same theme.
 * @param days How many days ahead, today included.
 */
export function themeSchedule(birthday: Date | null, days = 366, now = new Date()): ThemeStretch[] {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const stretches: ThemeStretch[] = [];
  for (let day = 0; day < days; day++) {
    const time = start + day * DAY;
    const theme = themeOn(new Date(time), birthday);
    const last = stretches.at(-1);
    if (last?.theme === theme) {
      last.to = new Date(time);
      last.days++;
    } else {
      stretches.push({ theme, from: new Date(time), to: new Date(time), days: 1 });
    }
  }
  return stretches;
}

/** The schedule as lines of text, like `2026-12-01 to 2026-12-30  christmas   30 days`, lined up for a code block. */
export function scheduleLines(birthday: Date | null, days?: number, now?: Date): string[] {
  const date = (value: Date) => value.toISOString().slice(0, 10);
  return [
    birthday ? `The bot's birthday is on ${date(birthday).slice(5)} each year.` : 'The birthday is left out.',
    '',
    ...themeSchedule(birthday, days, now).map(
      (stretch) => `${date(stretch.from)} to ${date(stretch.to)}  ${stretch.theme.padEnd(11)} ${stretch.days} ${stretch.days === 1 ? 'day' : 'days'}`,
    ),
    '',
    'Each change happens at midnight UTC, and the bot puts it on within 15 minutes.',
  ];
}
