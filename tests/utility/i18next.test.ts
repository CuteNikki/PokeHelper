import { readFileSync } from 'node:fs';

import { beforeAll, expect, test } from 'bun:test';

import { getTranslate, initI18Next, resolveLanguage } from 'utility/i18next';

beforeAll(() => initI18Next());

test.each([
  ['en-US', 'en'],
  ['en-GB', 'en'],
  ['de', 'de'],
  ['fr', 'en'],
  ['pt-BR', 'en'],
  [null, 'en'],
])('%p resolves to %p', (locale, expected) => {
  expect(resolveLanguage(locale)).toBe(expected);
});

test('translated keys use the language', () => {
  expect(getTranslate('de')('state.on')).toBe('An');
  expect(getTranslate('de-DE')('state.on')).toBe('An');
});

test('keys that are not translated yet fall back to English', () => {
  // Any key German doesn't have yet
  const english = JSON.parse(readFileSync('src/locales/en/messages.json', 'utf8')) as { botinfo: Record<string, unknown> };
  const german = JSON.parse(readFileSync('src/locales/de/messages.json', 'utf8')) as { botinfo?: Record<string, unknown> };
  const key = Object.keys(english.botinfo).find((name) => typeof english.botinfo[name] === 'string' && !german.botinfo?.[name]);
  if (!key) return;

  const t = getTranslate('de') as (key: string) => string;
  expect(t(`botinfo.`)).toBe((getTranslate('en') as (key: string) => string)(`botinfo.`));
});
