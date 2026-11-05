import { expect, test } from 'bun:test';

import { parseThreshold } from 'settings/starboard';

import { applyStarChange, isStarEmoji } from 'utility/starboard';

test('a normal emoji matches with or without its variation selector, a custom one by its ID even when renamed', () => {
  expect(isStarEmoji('⭐', { id: null, name: '⭐' })).toBe(true);
  expect(isStarEmoji('⭐', { id: null, name: '⭐️' })).toBe(true);
  expect(isStarEmoji('⭐', { id: null, name: '🌟' })).toBe(false);
  expect(isStarEmoji('<:shiny:123456789012345678>', { id: '123456789012345678', name: 'renamed' })).toBe(true);
  expect(isStarEmoji('<a:shiny:123456789012345678>', { id: '999999999999999999', name: 'shiny' })).toBe(false);
  // A custom emoji named like a normal one isn't it
  expect(isStarEmoji('⭐', { id: '123456789012345678', name: '⭐' })).toBe(false);
});

test('stars are added, taken back, toggled and cleared, each person once and never the author', () => {
  expect(applyStarChange(['a'], { add: 'b' }, 'author')).toEqual(['a', 'b']);
  expect(applyStarChange(['a', 'b'], { add: 'b' }, 'author')).toEqual(['a', 'b']);
  expect(applyStarChange(['a', 'b'], { remove: 'a' }, 'author')).toEqual(['b']);
  expect(applyStarChange(['a'], { toggle: 'b' }, 'author')).toEqual(['a', 'b']);
  expect(applyStarChange(['a', 'b'], { toggle: 'b' }, 'author')).toEqual(['a']);
  expect(applyStarChange(['a', 'b'], { clear: true }, 'author')).toEqual([]);
  // Who already reacted, read the first time, without the author's own star
  expect(applyStarChange(['author', 'a'], null, 'author')).toEqual(['a']);
  expect(applyStarChange([], { add: 'author' }, 'author')).toEqual([]);
});

test('the stars needed are a whole number from 1 to 100', () => {
  expect(parseThreshold('3')).toBe(3);
  expect(parseThreshold(' 100 ')).toBe(100);
  for (const text of ['0', '101', '2.5', '-1', 'three', '']) expect(parseThreshold(text)).toBeNull();
});
