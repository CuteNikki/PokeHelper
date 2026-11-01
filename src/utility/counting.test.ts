import { describe, expect, test } from 'bun:test';

import { applyCount, checkCount, replayCounts, type CountingState, type CountMessage } from 'utility/counting';

const emptyState: CountingState = {
  lastCheckedMessageId: null,
  lastNumber: 0,
  lastNumberAt: null,
  lastNumberMessageId: null,
  lastNumberByUserId: null,
  highestNumber: 0,
  highestNumberAt: null,
  highestNumberByUserId: null,
  highestNumberMessageId: null,
};

let nextId = 1000n;
const message = (authorId: string, content: string, isBot = false): CountMessage & { isBot: boolean } => ({
  id: (nextId++).toString(),
  content,
  authorId,
  createdAt: new Date(),
  isBot,
});

describe('checkCount', () => {
  const counting = { lastNumber: 4, lastNumberByUserId: 'alice', allowMath: false };

  test('the next number from someone else is valid', () => {
    expect(checkCount(counting, message('bob', '5'))).toEqual({ result: 'valid', number: 5 });
  });

  test('counting twice in a row is caught before the number is checked', () => {
    expect(checkCount(counting, message('alice', '5'))).toEqual({ result: 'consecutive' });
  });

  test('a wrong number or non-number is wrong', () => {
    expect(checkCount(counting, message('bob', '6'))).toEqual({ result: 'wrong' });
    expect(checkCount(counting, message('bob', 'hello'))).toEqual({ result: 'wrong' });
  });

  test('math only counts when allowed', () => {
    expect(checkCount(counting, message('bob', '2+3'))).toEqual({ result: 'wrong' });
    expect(checkCount({ ...counting, allowMath: true }, message('bob', '2+3'))).toEqual({ result: 'valid', number: 5 });
  });
});

describe('applyCount', () => {
  test('tracks the highest number only when it is beaten', () => {
    const first = applyCount({ ...emptyState, highestNumber: 10, highestNumberByUserId: 'carol' }, 1, message('alice', '1'));
    expect(first.lastNumber).toBe(1);
    expect(first.highestNumber).toBe(10);
    expect(first.highestNumberByUserId).toBe('carol');

    const beaten = applyCount({ ...first, lastNumber: 10 }, 11, message('bob', '11'));
    expect(beaten.highestNumber).toBe(11);
    expect(beaten.highestNumberByUserId).toBe('bob');
  });
});

describe('replayCounts', () => {
  test('counts valid messages and marks invalid ones for deletion', () => {
    const messages = [message('alice', '1'), message('bob', '2'), message('bob', '3'), message('carol', 'oops'), message('carol', '3 nice')];
    const result = replayCounts(emptyState, { allowMath: false, resetOnFail: false }, messages);

    expect(result.counted).toBe(3);
    expect(result.invalidIds).toEqual([messages[2]!.id, messages[3]!.id]);
    expect(result.resets).toEqual([]);
    expect(result.state.lastNumber).toBe(3);
    expect(result.state.lastNumberByUserId).toBe('carol');
    expect(result.state.lastNumberMessageId).toBe(messages[4]!.id);
    expect(result.state.lastCheckedMessageId).toBe(messages[4]!.id);
  });

  test('with reset on fail, a wrong number resets and counting continues from 1', () => {
    const messages = [message('alice', '1'), message('bob', '2'), message('carol', '7'), message('alice', '1'), message('bob', '2')];
    const result = replayCounts(emptyState, { allowMath: false, resetOnFail: true }, messages);

    expect(result.resets).toEqual([{ number: 2, userId: 'carol' }]);
    expect(result.invalidIds).toEqual([]);
    expect(result.state.lastNumber).toBe(2);
    expect(result.state.highestNumber).toBe(2);
  });

  test('counting twice in a row is removed even with reset on fail, like when live', () => {
    const messages = [message('alice', '1'), message('alice', '2')];
    const result = replayCounts(emptyState, { allowMath: false, resetOnFail: true }, messages);

    expect(result.resets).toEqual([]);
    expect(result.invalidIds).toEqual([messages[1]!.id]);
    expect(result.state.lastNumber).toBe(1);
  });

  test('bot messages are skipped but still marked as checked', () => {
    const messages = [message('alice', '1'), message('bot', 'Caught up on counting', true)];
    const result = replayCounts(emptyState, { allowMath: false, resetOnFail: false }, messages);

    expect(result.invalidIds).toEqual([]);
    expect(result.state.lastNumber).toBe(1);
    expect(result.state.lastCheckedMessageId).toBe(messages[1]!.id);
  });

  test('continues from the saved state', () => {
    const state = { ...emptyState, lastNumber: 41, lastNumberByUserId: 'alice' };
    const result = replayCounts(state, { allowMath: true, resetOnFail: false }, [message('bob', '6*7')]);

    expect(result.state.lastNumber).toBe(42);
  });
});
