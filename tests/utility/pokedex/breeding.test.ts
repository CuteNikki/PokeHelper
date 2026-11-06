import { beforeAll, expect, test } from 'bun:test';

import { getTranslate, initI18Next } from 'utility/i18next';
import { genderRatio } from 'utility/pokedex/entry';

beforeAll(() => initI18Next());

test.each([
  ['en', 1, '87.5% male, 12.5% female'],
  ['de', 4, '50 % männlich, 50 % weiblich'],
  ['en', 0, '100% male'],
  ['en', 8, '100% female'],
  ['de', -1, 'Geschlechtslos'],
])('in %s, %d eighths female is "%s"', (language, eighths, expected) => {
  // German puts a narrow space before the percent sign
  expect(genderRatio(eighths, getTranslate(language)).replace(/\u202f|\u00a0/g, ' ')).toBe(expected);
});
