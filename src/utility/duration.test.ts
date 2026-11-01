import { beforeAll, expect, test } from 'bun:test';

import { formatDuration, formatNumber } from 'utility/duration';
import { initI18Next } from 'utility/i18next';

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
  expect(formatDuration(ms)).toBe(expected);
});

test('numbers get thousands separators', () => {
  expect(formatNumber(1234567)).toBe('1,234,567');
});
