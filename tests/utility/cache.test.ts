import { expect, test } from 'bun:test';

import { RecentCache } from 'utility/cache';

test('asking twice at once loads once', async () => {
  const cache = new RecentCache<number>(10);
  let loads = 0;
  const load = () => Promise.resolve(++loads);
  const [first, second] = await Promise.all([cache.get('a', load), cache.get('a', load)]);
  expect([first, second, loads]).toEqual([1, 1, 1]);
});

test("failures aren't kept, so the next try loads again", async () => {
  const cache = new RecentCache<number>(10);
  expect(cache.get('a', () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  await Bun.sleep(0);
  expect(await cache.get('a', () => Promise.resolve(2))).toBe(2);
});

test('the least recently used go first, and expired ones are loaded again', async () => {
  const cache = new RecentCache<string>(2);
  await cache.get('a', () => Promise.resolve('a'));
  await cache.get('b', () => Promise.resolve('b'));
  await cache.get('a', () => Promise.resolve('a again'));
  await cache.get('c', () => Promise.resolve('c'));
  expect(await cache.get('b', () => Promise.resolve('b again'))).toBe('b again');

  const expiring = new RecentCache<string>(10, 0);
  await expiring.get('a', () => Promise.resolve('old'));
  expect(await expiring.get('a', () => Promise.resolve('new'))).toBe('new');
});
