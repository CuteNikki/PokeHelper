import { beforeAll, expect, test } from 'bun:test';

import { formatCompactNumber, formatDuration, formatNumber } from 'utility/duration';
import { getTranslate, initI18Next } from 'utility/i18next';

beforeAll(() => initI18Next());

const minutes = (n: number) => n * 60_000;

test.each([
  [0, '<1m'],
  [minutes(45), '45m'],
  [minutes(135), '2h 15m'],
  [minutes(120), '2h'],
  [minutes(60 * 24 * 3 + 60 * 4 + 30), '3d 4h'],
  [minutes(60 * 24 * 3 + 30), '3d'],
])('%pms is %p', (ms, expected) => {
  expect(formatDuration(ms, getTranslate('en'))).toBe(expected);
});

test('numbers get the thousands separators of the language', () => {
  expect(formatNumber(1234567, getTranslate('en'))).toBe('1,234,567');
  expect(formatNumber(1234567, getTranslate('de'))).toBe('1.234.567');
});

test.each([
  [999, 'en', '999'],
  [1234, 'en', '1.2k'],
  [1093, 'en', '1.1k'],
  [9999, 'en', '10k'],
  [12345, 'en', '12.3k'],
  [152100, 'en', '152k'],
  [1234567, 'en', '1.2M'],
  [2850000, 'en', '2.9M'],
  [1093, 'de', '1,1k'],
  [12345, 'de', '12,3k'],
  [1234567, 'de', '1,2M'],
])('%p in %s is shortened to %p', (value, language, expected) => {
  expect(formatCompactNumber(value, getTranslate(language))).toBe(expected);
});
