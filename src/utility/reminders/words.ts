import { existsSync, readFileSync } from 'node:fs';

import { DAY, HOUR, MINUTE } from 'utility/duration';
import { LOCALES_PATH, supportedLanguages } from 'utility/i18next';

/**
 * The words of one language that times are written with, from `src/locales/<language>/time.json`.
 * All in lowercase. A language can leave any list empty, like German, which has no am and pm.
 */
export interface TimeWords {
  /** Units of durations, like `h` or `Stunden`. */
  units: Record<UnitName, string[]>;
  /** Days counted from today, like `tomorrow` or `übermorgen`. */
  relativeDays: Record<RelativeDay, string[]>;
  weekdays: Record<WeekdayName, string[]>;
  /** Words that can come before a weekday without changing it, like `next` or `diesen`. */
  weekdayPrefixes: string[];
  /** Words that can come before a duration, like `in`. */
  durationPrefixes: string[];
  /** Words between the parts of a duration, like `and`. */
  joiners: string[];
  /** Words around the date and time, like `at` or `um`. */
  connectors: string[];
  am: string[];
  pm: string[];
  /** Words after an hour that say it's one, like `Uhr`. */
  hourSuffixes: string[];
}

export type UnitName = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
export type RelativeDay = 'today' | 'tomorrow' | 'dayAfterTomorrow';
export type WeekdayName = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

/** What a unit adds: a fixed time, or months on the calendar, so a month from January 31 is the end of February. */
export type Unit = { ms: number } | { months: number };

const UNITS: Record<UnitName, Unit> = {
  minute: { ms: MINUTE },
  hour: { ms: HOUR },
  day: { ms: DAY },
  week: { ms: 7 * DAY },
  month: { months: 1 },
  year: { months: 12 },
};
const RELATIVE_DAYS: Record<RelativeDay, number> = { today: 0, tomorrow: 1, dayAfterTomorrow: 2 };
/** The day of the week each is, 0 for Sunday like `Date.getUTCDay`. */
const WEEKDAYS: Record<WeekdayName, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/** The words of every language together, ready to look up, as people often write times in another language than Discord's. */
export interface Vocabulary {
  units: Map<string, Unit>;
  /** How many days from today each word is. */
  relativeDays: Map<string, number>;
  /** The day of the week each word is, 0 for Sunday. */
  weekdays: Map<string, number>;
  weekdayPrefixes: Set<string>;
  durationPrefixes: Set<string>;
  joiners: Set<string>;
  connectors: Set<string>;
  am: Set<string>;
  pm: Set<string>;
  hourSuffixes: Set<string>;
}

/** Each language's words. Languages without a `time.json` are left out, and their speakers can still use the others' words. */
export function loadTimeWords(): Record<string, TimeWords> {
  const result: Record<string, TimeWords> = {};
  for (const language of supportedLanguages) {
    const path = `${LOCALES_PATH}/${language}/time.json`;
    if (existsSync(path)) result[language] = JSON.parse(readFileSync(path, 'utf8')) as TimeWords;
  }
  return result;
}

/** Put the words of several languages together into one vocabulary. */
export function buildVocabulary(languages: TimeWords[]): Vocabulary {
  const vocabulary: Vocabulary = {
    units: new Map(),
    relativeDays: new Map(),
    weekdays: new Map(),
    weekdayPrefixes: new Set(),
    durationPrefixes: new Set(),
    joiners: new Set(),
    connectors: new Set(),
    am: new Set(),
    pm: new Set(),
    hourSuffixes: new Set(),
  };
  const lower = (words: string[] = []) => words.map((word) => word.toLowerCase());
  for (const words of languages) {
    for (const [name, list] of Object.entries(words.units ?? {})) for (const word of lower(list)) vocabulary.units.set(word, UNITS[name as UnitName]);
    for (const [name, list] of Object.entries(words.relativeDays ?? {}))
      for (const word of lower(list)) vocabulary.relativeDays.set(word, RELATIVE_DAYS[name as RelativeDay]);
    for (const [name, list] of Object.entries(words.weekdays ?? {}))
      for (const word of lower(list)) vocabulary.weekdays.set(word, WEEKDAYS[name as WeekdayName]);
    for (const key of ['weekdayPrefixes', 'durationPrefixes', 'joiners', 'connectors', 'am', 'pm', 'hourSuffixes'] as const)
      for (const word of lower(words[key])) vocabulary[key].add(word);
  }
  return vocabulary;
}

let cached: Vocabulary | null = null;

/** The words of every language, read once and kept until the locales are reloaded. */
export function getVocabulary(): Vocabulary {
  cached ??= buildVocabulary(Object.values(loadTimeWords()));
  return cached;
}

/** Forget the words read, so they're read again, like after the locales were changed. */
export function clearVocabulary() {
  cached = null;
}
