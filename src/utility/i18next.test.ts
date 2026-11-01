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
  expect(getTranslate('de')('leveling.disabled')).toBe(getTranslate('en')('leveling.disabled'));
});
