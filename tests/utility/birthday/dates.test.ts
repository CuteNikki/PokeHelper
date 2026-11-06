import { describe, expect, test } from 'bun:test';

import { ageInYear, getBirthdayActions, isBirthdayOn, parseBirthday } from 'utility/birthday/dates';

const birthday = (date: string) => new Date(`${date}T00:00:00Z`);
const nothingDone = { roleYear: null, announcedYear: null, roleActive: false };

describe('isBirthdayOn', () => {
  test('matches the month and day, not the year', () => {
    expect(isBirthdayOn(birthday('2000-07-14'), { year: 2026, month: 7, day: 14 })).toBe(true);
    expect(isBirthdayOn(birthday('2000-07-14'), { year: 2026, month: 7, day: 15 })).toBe(false);
  });

  test('February 29 is celebrated on February 28 outside leap years', () => {
    const leapDay = birthday('2004-02-29');
    expect(isBirthdayOn(leapDay, { year: 2027, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayOn(leapDay, { year: 2027, month: 3, day: 1 })).toBe(false);
    expect(isBirthdayOn(leapDay, { year: 2028, month: 2, day: 29 })).toBe(true);
    expect(isBirthdayOn(leapDay, { year: 2028, month: 2, day: 28 })).toBe(false);
  });
});

test('the age is the years since the birth year', () => {
  expect(ageInYear(birthday('2000-07-14'), 2026)).toBe(26);
});

describe('getBirthdayActions', () => {
  const july14 = { date: birthday('2000-07-14'), timezone: 'Europe/Berlin' };

  test('the role comes at the start of the day, the announcement from 8:00', () => {
    // 00:30 in Berlin
    expect(getBirthdayActions(july14, nothingDone, new Date('2026-07-13T22:30:00Z'))).toMatchObject({ giveRole: true, announce: false });
    // 09:00 in Berlin
    expect(getBirthdayActions(july14, nothingDone, new Date('2026-07-14T07:00:00Z'))).toMatchObject({ giveRole: true, announce: true, year: 2026 });
  });

  test('a late check still catches up on the day, but nothing is done twice', () => {
    const late = new Date('2026-07-14T20:00:00Z');
    expect(getBirthdayActions(july14, nothingDone, late)).toMatchObject({ giveRole: true, announce: true });
    expect(getBirthdayActions(july14, { roleYear: 2026, announcedYear: 2026, roleActive: true }, late)).toMatchObject({
      giveRole: false,
      announce: false,
      removeRole: false,
    });
  });

  test('the role is taken away whenever the bot runs after the birthday', () => {
    const daysLater = new Date('2026-07-17T12:00:00Z');
    expect(getBirthdayActions(july14, { roleYear: 2026, announcedYear: 2026, roleActive: true }, daysLater)).toMatchObject({ removeRole: true });
    expect(getBirthdayActions(july14, { roleYear: 2026, announcedYear: 2026, roleActive: false }, daysLater)).toMatchObject({ removeRole: false });
  });

  test('a birthday that passed while the bot was offline is not announced late', () => {
    expect(getBirthdayActions(july14, nothingDone, new Date('2026-07-15T12:00:00Z'))).toMatchObject({ giveRole: false, announce: false });
  });
});

describe('parseBirthday', () => {
  const now = new Date('2026-11-03T12:00:00Z');

  test('takes real dates, with or without leading zeros', () => {
    expect(parseBirthday('2000-05-01', now)).toEqual(birthday('2000-05-01'));
    expect(parseBirthday('2000-5-1', now)).toEqual(birthday('2000-05-01'));
    expect(parseBirthday('2004-02-29', now)).toEqual(birthday('2004-02-29'));
  });

  test('takes dates the way German speakers write them too', () => {
    expect(parseBirthday('01.05.2000', now)).toEqual(birthday('2000-05-01'));
    expect(parseBirthday('1.5.2000', now)).toEqual(birthday('2000-05-01'));
    for (const input of ['31.02.2000', '01.05.00', '01.05.']) expect(parseBirthday(input, now)).toBeNull();
  });

  test("refuses dates that don't exist instead of rolling them over", () => {
    for (const input of ['2000-02-31', '2001-02-29', '2000-13-01', '2000-00-10', '2000-04-31']) expect(parseBirthday(input, now)).toBeNull();
  });

  test('refuses short years, years before 1900 and dates in the future', () => {
    for (const input of ['95-05-01', '1026-05-01', '2027-01-01', '2026-11-04', 'May 1', '']) expect(parseBirthday(input, now)).toBeNull();
  });
});
