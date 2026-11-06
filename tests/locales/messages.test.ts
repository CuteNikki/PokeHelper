import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { ICONS } from 'utility/icons';
import { supportedLanguages } from 'utility/i18next';

type Messages = { [key: string]: string | Messages };

const load = (language: string) => JSON.parse(readFileSync(`src/locales/${language}/messages.json`, 'utf8')) as Messages;

/** Every text in a messages file, by its dotted key. */
function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') result.set(`${prefix}${key}`, value);
    else for (const [nested, text] of flatten(value, `${prefix}${key}.`)) result.set(nested, text);
  }
  return result;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const english = flatten(load('en'));

describe.each(supportedLanguages.filter((language) => language !== 'en'))('%s translations', (language) => {
  const translated = flatten(load(language));

  test('only translate keys that exist in English', () => {
    const unknown = [...translated.keys()].filter((key) => !english.has(key));
    expect(unknown).toEqual([]);
  });

  test('use the same placeholders as English', () => {
    const mismatched = [...translated].filter(([key, text]) => placeholders(text).join() !== placeholders(english.get(key) ?? '').join()).map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});

/** The icons a text uses, like `trophy` for `{{icon.trophy}}`. */
const icons = (text: string) => [...text.matchAll(/\{\{icon\.([a-z0-9-]+)\}\}/g)].map((match) => match[1]!).sort();

describe.each(supportedLanguages)('icons in the %s texts', (language) => {
  const texts = flatten(load(language));

  test('are icons there are', () => {
    const unknown = [...texts].flatMap(([key, text]) =>
      icons(text)
        .filter((icon) => !(icon in ICONS))
        .map((icon) => `${key}: ${icon}`),
    );
    expect(unknown).toEqual([]);
  });

  test('are the same as in English', () => {
    const mismatched = [...texts].filter(([key, text]) => english.has(key) && icons(text).join() !== icons(english.get(key)!).join()).map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});
