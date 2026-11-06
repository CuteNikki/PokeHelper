import { describe, expect, test } from 'bun:test';

import { fromWallTime, getWallTime, resolveTimezone } from 'utility/timezone';

const BERLIN = 'Europe/Berlin';

describe('the time on the clock', () => {
  test('uses the timezone', () => {
    // 23:30 UTC on Jan 31 is already Feb 1 in Berlin
    expect(getWallTime(new Date('2026-01-31T23:30:00Z'), BERLIN)).toEqual({ year: 2026, month: 2, day: 1, hour: 0, minute: 30 });
    expect(getWallTime(new Date('2026-01-31T23:30:00Z'), 'America/New_York')).toEqual({ year: 2026, month: 1, day: 31, hour: 18, minute: 30 });
  });

  test('falls back to UTC for missing or unknown timezones', () => {
    expect(getWallTime(new Date('2026-01-31T23:30:00Z'), null)).toEqual({ year: 2026, month: 1, day: 31, hour: 23, minute: 30 });
    expect(getWallTime(new Date('2026-01-31T23:30:00Z'), 'Not/AZone')).toEqual({ year: 2026, month: 1, day: 31, hour: 23, minute: 30 });
  });
});

describe('the moment a time on the clock is', () => {
  test('times skipped when the clocks go forward come out an hour later', () => {
    expect(fromWallTime({ year: 2027, month: 3, day: 28, hour: 2, minute: 30 }, BERLIN)).toEqual(new Date('2027-03-28T01:30:00Z'));
  });

  test('times that happen twice when the clocks go back are the first one', () => {
    expect(fromWallTime({ year: 2027, month: 10, day: 31, hour: 2, minute: 30 }, BERLIN)).toEqual(new Date('2027-10-31T00:30:00Z'));
  });
});

test('timezones are found whatever their case, and keep how they are written', () => {
  expect(resolveTimezone('europe/berlin')).toBe('Europe/Berlin');
  expect(resolveTimezone(' America/New_York ')).toBe('America/New_York');
  expect(resolveTimezone('Mars/Olympus')).toBeNull();
});
