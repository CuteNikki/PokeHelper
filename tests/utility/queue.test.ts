import { expect, test } from 'bun:test';

import { KeyedQueue } from 'utility/queue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('tasks with the same key run one at a time, in order', async () => {
  const queue = new KeyedQueue();
  const order: string[] = [];

  await Promise.all([
    queue.run('a', async () => {
      await sleep(20);
      order.push('first');
    }),
    queue.run('a', () => {
      order.push('second');
      return Promise.resolve();
    }),
  ]);

  expect(order).toEqual(['first', 'second']);
});

test('tasks with different keys do not wait on each other', async () => {
  const queue = new KeyedQueue();
  const order: string[] = [];

  await Promise.all([
    queue.run('a', async () => {
      await sleep(20);
      order.push('slow');
    }),
    queue.run('b', () => {
      order.push('fast');
      return Promise.resolve();
    }),
  ]);

  expect(order).toEqual(['fast', 'slow']);
});

test('a failing task rejects for its caller but does not block the next one', async () => {
  const queue = new KeyedQueue();

  const failing = queue.run('a', () => Promise.reject(new Error('boom')));
  const next = queue.run('a', () => Promise.resolve('ran'));

  expect(await failing.catch((error: Error) => error.message)).toBe('boom');
  expect(await next).toBe('ran');
});
