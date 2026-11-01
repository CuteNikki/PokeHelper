import { describe, expect, test } from 'bun:test';

import {
  clampPage,
  leaderboardCustomId,
  leaderboardPageModalId,
  parseLeaderboardCustomId,
  parseLeaderboardPageModalId,
  type LeaderboardView,
} from 'utility/leaderboardView';

const view: LeaderboardView = { page: 3, sortOrder: 'asc', weekly: true, text: true };

describe('leaderboard custom IDs', () => {
  test('carry the action and the whole view, which parse back', () => {
    expect(parseLeaderboardCustomId(leaderboardCustomId('next', view))).toEqual({ action: 'next', view });
    expect(parseLeaderboardCustomId(leaderboardCustomId('first', { ...view, weekly: false, text: false }))).toEqual({
      action: 'first',
      view: { ...view, weekly: false, text: false },
    });
    expect(parseLeaderboardPageModalId(leaderboardPageModalId(view))).toEqual(view);
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

test('pages are kept within the pages there are', () => {
  expect(clampPage(9, 3)).toBe(3);
  expect(clampPage(0, 3)).toBe(1);
  expect(clampPage(-2, 3)).toBe(1);
  expect(clampPage(2, 3)).toBe(2);
  expect(clampPage(5, 0)).toBe(1);
});
