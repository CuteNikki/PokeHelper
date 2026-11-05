import { beforeEach, expect, test } from 'bun:test';

import { resetBursts, takeBurst } from 'utility/rateLimit';

const limit = { uses: 3, window: 5_000 };

beforeEach(() => resetBursts());

test('a few uses in a row go ahead, and the next waits until the oldest leaves the window', () => {
  expect(takeBurst('a', limit, 0)).toBeNull();
  expect(takeBurst('a', limit, 100)).toBeNull();
  expect(takeBurst('a', limit, 200)).toBeNull();
  expect(takeBurst('a', limit, 300)).toBe(5_000);
  // A refused use doesn't count, so it's free again once the first one is over
  expect(takeBurst('a', limit, 5_000)).toBeNull();
});

test('each button and user is counted on its own', () => {
  for (let i = 0; i < 3; i++) takeBurst('a', limit, 0);
  expect(takeBurst('b', limit, 0)).toBeNull();
});
