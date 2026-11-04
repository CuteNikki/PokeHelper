import { describe, expect, test } from 'bun:test';

import { easterSunday, themeOn } from '../../art/calendar';

const on = (date: string, birthday: string | null = null) => themeOn(new Date(`${date}T12:00:00Z`), birthday ? new Date(`${birthday}T12:00:00Z`) : null);

test('easterSunday knows the Easter dates of a few years', () => {
  expect(easterSunday(2024).toISOString().slice(0, 10)).toBe('2024-03-31');
  expect(easterSunday(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
  expect(easterSunday(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
  expect(easterSunday(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
});

describe('themeOn', () => {
  test('has a season for every ordinary day', () => {
    expect(on('2026-01-20')).toBe('winter');
    expect(on('2026-03-20')).toBe('spring');
    expect(on('2026-07-20')).toBe('summer');
    expect(on('2026-09-20')).toBe('autumn');
    expect(on('2026-11-15')).toBe('autumn');
  });

  test('has its own look between the seasons, in the first half of January, March, July and September', () => {
    expect(on('2027-01-02')).toBe('standard');
    expect(on('2027-01-15')).toBe('standard');
    expect(on('2027-01-16')).toBe('winter');
    expect(on('2027-07-02')).toBe('standard');
    expect(on('2027-07-15')).toBe('standard');
    expect(on('2027-07-16')).toBe('summer');
    expect(on('2027-03-01')).toBe('standard');
    expect(on('2027-03-15')).toBe('standard');
    expect(on('2027-03-16')).toBe('spring');
    expect(on('2027-09-01')).toBe('standard');
    expect(on('2027-09-15')).toBe('standard');
    expect(on('2027-09-16')).toBe('autumn');
  });

  test('has the holidays over the seasons', () => {
    expect(on('2026-10-01')).toBe('halloween');
    expect(on('2026-10-31')).toBe('halloween');
    expect(on('2026-12-01')).toBe('christmas');
    expect(on('2026-12-30')).toBe('christmas');
    expect(on('2026-12-31')).toBe('newYear');
    expect(on('2027-01-01')).toBe('newYear');
    expect(on('2026-02-14')).toBe('valentines');
    expect(on('2026-06-15')).toBe('pride');
  });

  test('has Easter from Palm Sunday to Easter Monday, whenever Easter is', () => {
    expect(on('2026-03-28')).toBe('spring');
    expect(on('2026-03-29')).toBe('easter');
    expect(on('2026-04-06')).toBe('easter');
    expect(on('2026-04-07')).toBe('spring');
    expect(on('2027-03-21')).toBe('easter');
  });

  test('has Easter over the look between the seasons, when Easter is as early as can be', () => {
    // Easter was on March 22 in 2285, its earliest day, so Palm Sunday was on March 15
    expect(on('2285-03-14')).toBe('standard');
    expect(on('2285-03-15')).toBe('easter');
  });

  test("has the bot's birthday over everything, on its day each year", () => {
    expect(on('2027-10-12', '2021-10-12')).toBe('birthday');
    expect(on('2027-10-13', '2021-10-12')).toBe('halloween');
  });
});
