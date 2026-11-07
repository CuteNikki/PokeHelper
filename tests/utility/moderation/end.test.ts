import { describe, expect, test } from 'bun:test';

import { canChangeEnd, parseNewEnd } from 'utility/moderation/end';

const now = new Date('2026-11-07T12:00:00Z');
const current = new Date('2026-11-10T12:00:00Z');

describe('changing when a timeout or ban ends', () => {
  test('a duration counts from now', () => {
    expect(parseNewEnd('3d', 'timeout', current, 'UTC', now)).toEqual(new Date('2026-11-10T12:00:00Z'));
    expect(parseNewEnd('2 Stunden', 'ban', current, 'UTC', now)).toEqual(new Date('2026-11-07T14:00:00Z'));
  });

  test('+ and - move the end it has', () => {
    expect(parseNewEnd('+1d', 'timeout', current, 'UTC', now)).toEqual(new Date('2026-11-11T12:00:00Z'));
    expect(parseNewEnd('- 2h', 'ban', current, 'UTC', now)).toEqual(new Date('2026-11-10T10:00:00Z'));
  });

  test('a ban for good counts + from now', () => {
    expect(parseNewEnd('+1w', 'ban', null, 'UTC', now)).toEqual(new Date('2026-11-14T12:00:00Z'));
  });

  test('a date is in the timezone given', () => {
    expect(parseNewEnd('24.12. 18:00', 'ban', current, 'Europe/Berlin', now)).toEqual(new Date('2026-12-24T17:00:00Z'));
  });

  test('never makes a ban one for good, but not a timeout', () => {
    expect(parseNewEnd('never', 'ban', current, 'UTC', now)).toBeNull();
    expect(parseNewEnd('Für immer', 'ban', current, 'UTC', now)).toBeNull();
    expect(parseNewEnd('never', 'timeout', current, 'UTC', now)).toBe('neverTimeout');
  });

  test("can't end in the past, too late, or be nonsense", () => {
    expect(parseNewEnd('-4d', 'timeout', current, 'UTC', now)).toBe('past');
    expect(parseNewEnd('+26d', 'timeout', current, 'UTC', now)).toBe('tooLong');
    expect(parseNewEnd('+1d', 'timeout', current, 'UTC', now)).not.toBe('tooLong');
    expect(parseNewEnd('soon', 'ban', current, 'UTC', now)).toBe('invalid');
    expect(parseNewEnd('+soon', 'ban', current, 'UTC', now)).toBe('invalid');
  });

  test('only for timeouts and bans that are still on', () => {
    expect(canChangeEnd({ type: 'timeout', endedAt: null, expiresAt: current }, now)).toBe(true);
    expect(canChangeEnd({ type: 'ban', endedAt: null, expiresAt: null }, now)).toBe(true);
    expect(canChangeEnd({ type: 'timeout', endedAt: null, expiresAt: new Date('2026-11-06T00:00:00Z') }, now)).toBe(false);
    expect(canChangeEnd({ type: 'ban', endedAt: now, expiresAt: null }, now)).toBe(false);
    expect(canChangeEnd({ type: 'warn', endedAt: null, expiresAt: null }, now)).toBe(false);
  });
});
