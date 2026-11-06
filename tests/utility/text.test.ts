import { expect, test } from 'bun:test';

import { code, quote, shorten } from 'utility/text';

test('shortened texts fit their limit exactly, the … included', () => {
  expect(shorten('abcdef', 3)).toBe('ab…');
  expect(shorten('abcdef', 3)).toHaveLength(3);
  expect(shorten('abc', 3)).toBe('abc');
});

test("backticks in code are swapped, so they can't end it", () => {
  expect(code('a`b')).toBe('`aˋb`');
});

test('every line is quoted', () => {
  expect(quote('one\ntwo')).toBe('> one\n> two');
});
