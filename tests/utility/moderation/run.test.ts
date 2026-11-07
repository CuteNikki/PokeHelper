import { describe, expect, test } from 'bun:test';

import { parseModerationDuration } from 'utility/moderation/run';

const now = new Date('2026-11-07T12:00:00Z');

describe('moderation durations', () => {
  test('end as long after now as typed, in any language', () => {
    expect(parseModerationDuration('10m', 28, now)).toEqual(new Date('2026-11-07T12:10:00Z'));
    expect(parseModerationDuration('2 Tage', 28, now)).toEqual(new Date('2026-11-09T12:00:00Z'));
  });

  test('can be as long as allowed, but not longer', () => {
    expect(parseModerationDuration('28d', 28, now)).toEqual(new Date('2026-12-05T12:00:00Z'));
    expect(parseModerationDuration('29d', 28, now)).toBe('tooLong');
  });

  test("aren't dates, times or nothing", () => {
    expect(parseModerationDuration('tomorrow', 28, now)).toBe('invalid');
    expect(parseModerationDuration('18:00', 28, now)).toBe('invalid');
    expect(parseModerationDuration('0m', 28, now)).toBe('invalid');
  });
});
