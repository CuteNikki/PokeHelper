import { expect, test } from 'bun:test';

import { parseThreshold } from 'settings/starboard';

import { countStars, isStarEmoji } from 'utility/starboard';

test('a normal emoji matches with or without its variation selector, a custom one by its ID even when renamed', () => {
  expect(isStarEmoji('⭐', { id: null, name: '⭐' })).toBe(true);
  expect(isStarEmoji('⭐', { id: null, name: '⭐️' })).toBe(true);
  expect(isStarEmoji('⭐', { id: null, name: '🌟' })).toBe(false);
  expect(isStarEmoji('<:shiny:123456789012345678>', { id: '123456789012345678', name: 'renamed' })).toBe(true);
  expect(isStarEmoji('<a:shiny:123456789012345678>', { id: '999999999999999999', name: 'shiny' })).toBe(false);
  // A custom emoji named like a normal one isn't it
  expect(isStarEmoji('⭐', { id: '123456789012345678', name: '⭐' })).toBe(false);
});

test("the author's own star and bots' don't count", () => {
  const users = [
    { id: 'author', bot: false },
    { id: 'friend', bot: false },
    { id: 'bot', bot: true },
  ];
  expect(countStars(3, users, 'author')).toBe(1);
  // More reacted than were fetched: only the ones known not to count are taken off
  expect(countStars(150, users, 'author')).toBe(148);
  expect(countStars(1, [{ id: 'author', bot: false }], 'author')).toBe(0);
});

test('the reactions needed are a whole number from 1 to 100', () => {
  expect(parseThreshold('3')).toBe(3);
  expect(parseThreshold(' 100 ')).toBe(100);
  for (const text of ['0', '101', '2.5', '-1', 'three', '']) expect(parseThreshold(text)).toBeNull();
});
