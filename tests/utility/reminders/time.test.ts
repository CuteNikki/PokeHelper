import { describe, expect, test } from 'bun:test';

import { fromWallTime, nextOccurrence, parseDateTime, parseDuration, parseWhen } from 'utility/reminders/time';
import { buildVocabulary, type TimeWords } from 'utility/reminders/words';

// A Wednesday afternoon in Berlin, which is UTC+1 in November
const now = new Date('2026-11-04T15:00:00Z');
const BERLIN = 'Europe/Berlin';

describe('durations', () => {
  test('in English and German, with several parts', () => {
    expect(parseDuration('10m', now)).toEqual(new Date('2026-11-04T15:10:00Z'));
    expect(parseDuration('2h 30m', now)).toEqual(new Date('2026-11-04T17:30:00Z'));
    expect(parseDuration('2h30m', now)).toEqual(new Date('2026-11-04T17:30:00Z'));
    expect(parseDuration('in 3 days and 4 hours', now)).toEqual(new Date('2026-11-07T19:00:00Z'));
    expect(parseDuration('1,5 Std', now)).toEqual(new Date('2026-11-04T16:30:00Z'));
    expect(parseDuration('1 Tag, 2 Stunden', now)).toEqual(new Date('2026-11-05T17:00:00Z'));
    expect(parseDuration('1w', now)).toEqual(new Date('2026-11-11T15:00:00Z'));
  });

  test('English and German can be mixed, whatever language Discord is in', () => {
    expect(parseDuration('in 2d und 3 Std', now)).toEqual(new Date('2026-11-06T18:00:00Z'));
    expect(parseDuration('1 Tag 2h', now)).toEqual(new Date('2026-11-05T17:00:00Z'));
    expect(parseDateTime('morgen 6pm', now, BERLIN)).toEqual(new Date('2026-11-05T17:00:00Z'));
    expect(parseDateTime('friday um 18 Uhr', now, BERLIN)).toEqual(new Date('2026-11-06T17:00:00Z'));
  });

  test('months go by the calendar', () => {
    expect(parseDuration('1 month', new Date('2027-01-31T10:00:00Z'))).toEqual(new Date('2027-02-28T10:00:00Z'));
    expect(parseDuration('1y', now)).toEqual(new Date('2027-11-04T15:00:00Z'));
  });

  test('others are not durations', () => {
    for (const input of ['', '10', 'soon', '10 parsecs', '18:00', '2h foo']) expect(parseDuration(input, now)).toBeNull();
  });
});

describe('dates and times', () => {
  test('a time is today, or tomorrow once it passed', () => {
    expect(parseDateTime('18:00', now, BERLIN)).toEqual(new Date('2026-11-04T17:00:00Z'));
    expect(parseDateTime('9:00', now, BERLIN)).toEqual(new Date('2026-11-05T08:00:00Z'));
    expect(parseDateTime('6pm', now, BERLIN)).toEqual(new Date('2026-11-04T17:00:00Z'));
    expect(parseDateTime('18 Uhr', now, BERLIN)).toEqual(new Date('2026-11-04T17:00:00Z'));
    expect(parseDateTime('12am', now, 'UTC')).toEqual(new Date('2026-11-05T00:00:00Z'));
  });

  test('dates in German and ISO style, with or without a time and year', () => {
    expect(parseDateTime('24.12. 18:00', now, BERLIN)).toEqual(new Date('2026-12-24T17:00:00Z'));
    expect(parseDateTime('am 24.12. um 18 Uhr', now, BERLIN)).toEqual(new Date('2026-12-24T17:00:00Z'));
    expect(parseDateTime('24.12.2027', now, BERLIN)).toEqual(new Date('2027-12-24T08:00:00Z'));
    expect(parseDateTime('2026-12-24 at 6:30pm', now, BERLIN)).toEqual(new Date('2026-12-24T17:30:00Z'));
    expect(parseDateTime('tomorrow 9am', now, BERLIN)).toEqual(new Date('2026-11-05T08:00:00Z'));
    expect(parseDateTime('morgen', now, BERLIN)).toEqual(new Date('2026-11-05T08:00:00Z'));
  });

  test('a date without a year that passed is next year, one with a year is in the past', () => {
    expect(parseDateTime('1.3.', now, BERLIN)).toEqual(new Date('2027-03-01T08:00:00Z'));
    expect(parseDateTime('1.3.2026', now, BERLIN)).toBe('past');
    expect(parseDateTime('today 10:00', now, BERLIN)).toBe('past');
  });

  test('weekdays are the next one, or a week later once their time passed', () => {
    // It's Wednesday 16:00 in Berlin
    expect(parseDateTime('friday 9am', now, BERLIN)).toEqual(new Date('2026-11-06T08:00:00Z'));
    expect(parseDateTime('next fri 18:00', now, BERLIN)).toEqual(new Date('2026-11-06T17:00:00Z'));
    expect(parseDateTime('am Freitag um 18 Uhr', now, BERLIN)).toEqual(new Date('2026-11-06T17:00:00Z'));
    expect(parseDateTime('montag', now, BERLIN)).toEqual(new Date('2026-11-09T08:00:00Z'));
    expect(parseDateTime('wednesday 18:00', now, BERLIN)).toEqual(new Date('2026-11-04T17:00:00Z'));
    expect(parseDateTime('wednesday 9:00', now, BERLIN)).toEqual(new Date('2026-11-11T08:00:00Z'));
  });

  test('summer time is taken into account', () => {
    expect(parseDateTime('1.7. 12:00', now, BERLIN)).toEqual(new Date('2027-07-01T10:00:00Z'));
  });

  test('others are not dates', () => {
    for (const input of ['31.2.', '25:00', '13pm', 'next week', '24.12. soon', '18']) expect(parseDateTime(input, now, BERLIN)).toBe('invalid');
  });
});

test('when a reminder is due, with limits', () => {
  expect(parseWhen('10m', now, BERLIN)).toEqual(new Date('2026-11-04T15:10:00Z'));
  expect(parseWhen('18:00', now, BERLIN)).toEqual(new Date('2026-11-04T17:00:00Z'));
  expect(parseWhen('0m', now, BERLIN)).toBe('past');
  expect(parseWhen('6y', now, BERLIN)).toBe('tooFar');
  expect(parseWhen('whenever', now, BERLIN)).toBe('invalid');
  expect(parseWhen('99999999999 years', now, BERLIN)).toBe('tooFar');
  expect(parseWhen('9999999999999999d', now, BERLIN)).toBe('tooFar');
});

test('times skipped when the clocks go forward come out an hour later', () => {
  expect(fromWallTime({ year: 2027, month: 3, day: 28, hour: 2, minute: 30 }, BERLIN)).toEqual(new Date('2027-03-28T01:30:00Z'));
});

describe('repeating', () => {
  test('keeps the time on the clock over summer time', () => {
    const start = new Date('2027-03-27T08:00:00Z'); // 9:00 in Berlin, the day before the clocks go forward
    expect(nextOccurrence(start, 'daily', BERLIN, start)).toEqual(new Date('2027-03-28T07:00:00Z'));
  });

  test('stays on the 31st, on the last day of shorter months', () => {
    const start = new Date('2027-01-31T09:00:00Z');
    expect(nextOccurrence(start, 'monthly', 'UTC', start)).toEqual(new Date('2027-02-28T09:00:00Z'));
    expect(nextOccurrence(start, 'monthly', 'UTC', new Date('2027-02-28T09:00:00Z'))).toEqual(new Date('2027-03-31T09:00:00Z'));
  });

  test('skips the ones missed, to the next one after now', () => {
    const start = new Date('2026-01-05T09:00:00Z');
    expect(nextOccurrence(start, 'weekly', 'UTC', now)).toEqual(new Date('2026-11-09T09:00:00Z'));
    expect(nextOccurrence(start, 'yearly', 'UTC', now)).toEqual(new Date('2027-01-05T09:00:00Z'));
    expect(nextOccurrence(start, 'daily', 'UTC', now)).toEqual(new Date('2026-11-05T09:00:00Z'));
  });
});

test('times that happen twice when the clocks go back are the first one', () => {
  expect(fromWallTime({ year: 2027, month: 10, day: 31, hour: 2, minute: 30 }, BERLIN)).toEqual(new Date('2027-10-31T00:30:00Z'));
});

test('another language only needs its words', () => {
  const french: TimeWords = {
    units: { minute: ['min'], hour: ['heure', 'heures'], day: ['jour', 'jours'], week: ['semaine', 'semaines'], month: ['mois'], year: ['an', 'ans'] },
    relativeDays: { today: ["aujourd'hui"], tomorrow: ['demain'], dayAfterTomorrow: ['après-demain'] },
    weekdays: {
      monday: ['lundi'],
      tuesday: ['mardi'],
      wednesday: ['mercredi'],
      thursday: ['jeudi'],
      friday: ['vendredi'],
      saturday: ['samedi'],
      sunday: ['dimanche'],
    },
    weekdayPrefixes: ['prochain'],
    durationPrefixes: ['dans'],
    joiners: ['et'],
    connectors: ['à'],
    am: [],
    pm: [],
    hourSuffixes: ['h'],
  };
  const words = buildVocabulary([french]);
  expect(parseWhen('dans 2 heures et 30 min', now, BERLIN, words)).toEqual(new Date('2026-11-04T17:30:00Z'));
  expect(parseWhen('demain à 9h', now, BERLIN, words)).toEqual(new Date('2026-11-05T08:00:00Z'));
  expect(parseWhen('vendredi 18:00', now, BERLIN, words)).toEqual(new Date('2026-11-06T17:00:00Z'));
});
