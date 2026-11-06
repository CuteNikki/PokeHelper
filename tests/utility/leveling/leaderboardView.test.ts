import { describe, expect, test } from 'bun:test';

import {
  leaderboardCustomId,
  leaderboardPageModalId,
  nextPeriod,
  parseLeaderboardCustomId,
  parseLeaderboardPageModalId,
  type LeaderboardView,
} from 'utility/leveling/leaderboardView';

const view: LeaderboardView = { page: 3, sortOrder: 'asc', period: 'weekly', text: true };

describe('leaderboard custom IDs', () => {
  test('carry the action and the whole view, which parse back', () => {
    expect(parseLeaderboardCustomId(leaderboardCustomId('next', view))).toEqual({ action: 'next', view });
    expect(parseLeaderboardCustomId(leaderboardCustomId('first', { ...view, period: 'allTime', text: false }))).toEqual({
      action: 'first',
      view: { ...view, period: 'allTime', text: false },
    });
    expect(parseLeaderboardCustomId(leaderboardCustomId('period', { ...view, period: 'monthly' }))?.view.period).toBe('monthly');
    expect(parseLeaderboardPageModalId(leaderboardPageModalId(view))).toEqual(view);
  });

  test('buttons from before monthly existed still work', () => {
    expect(parseLeaderboardCustomId('lb:next:2:desc:w:i')).toEqual({ action: 'next', view: { page: 2, sortOrder: 'desc', period: 'weekly', text: false } });
    expect(parseLeaderboardCustomId('lb:next:2:desc:a:t')?.view.period).toBe('allTime');
  });

  test('stay well within the 100 characters Discord allows', () => {
    expect(leaderboardCustomId('sort', { ...view, page: 123456 }).length).toBeLessThan(40);
  });

  test('others are not leaderboard custom IDs', () => {
    for (const id of ['lb_next', 'lb:', 'lb:jump:1:desc:a:i', 'lb:next:0:desc:a:i', 'lb:next:x:desc:a:i', 'lb:next:2:desc:z:i', 'settings:lb']) {
      expect(parseLeaderboardCustomId(id)).toBeNull();
    }
  });
});

test('the period button cycles through all-time, weekly and monthly', () => {
  expect(nextPeriod('allTime')).toBe('weekly');
  expect(nextPeriod('weekly')).toBe('monthly');
  expect(nextPeriod('monthly')).toBe('allTime');
});
