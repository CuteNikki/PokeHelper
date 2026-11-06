import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { supportedLanguages } from 'utility/i18next';
import { loadTimeWords, type TimeWords } from 'utility/reminders/words';

const all = loadTimeWords();
const english = JSON.parse(readFileSync('src/locales/en/time.json', 'utf8')) as TimeWords;

/** The shape of a words file: its keys, and the keys of what's in them. */
const shape = (words: TimeWords) =>
  Object.entries(words)
    .map(([key, value]) => (Array.isArray(value) ? key : `${key}: ${Object.keys(value as object).join(', ')}`))
    .sort();

describe.each(supportedLanguages)('%s time words', (language) => {
  const words = all[language];

  test('exist and have the same lists as English', () => {
    expect(words).toBeDefined();
    expect(shape(words!)).toEqual(shape(english));
  });

  test('are lowercase single words', () => {
    const lists = Object.values(words!).flatMap((value: string[] | Record<string, string[]>) => (Array.isArray(value) ? [value] : Object.values(value)));
    // Apostrophes and hyphens are fine, like the French aujourd'hui
    const wrong = lists.flat().filter((word) => word !== word.toLowerCase() || !/^[\p{L}'-]+$/u.test(word));
    expect(wrong).toEqual([]);
  });

  test('written right after a number are only letters, like 2h or 6pm', () => {
    const attached = [...Object.values(words!.units).flat(), ...words!.am, ...words!.pm, ...words!.hourSuffixes];
    expect(attached.filter((word) => !/^\p{L}+$/u.test(word))).toEqual([]);
  });
});

test('no word means two different things in different languages', () => {
  for (const key of ['units', 'relativeDays', 'weekdays'] as const) {
    const meanings = new Map<string, string>();
    const clashes: string[] = [];
    for (const [language, words] of Object.entries(all)) {
      for (const [meaning, list] of Object.entries(words[key])) {
        for (const word of list) {
          const known = meanings.get(word);
          if (known && known !== meaning) clashes.push(`${key}: "${word}" is ${known} and ${meaning} (${language})`);
          meanings.set(word, meaning);
        }
      }
    }
    expect(clashes).toEqual([]);
  }
});
