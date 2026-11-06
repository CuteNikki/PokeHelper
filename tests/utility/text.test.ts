import { expect, test } from 'bun:test';

import { code, quote } from 'utility/text';

test("backticks in code are swapped, so they can't end it", () => {
  expect(code('a`b')).toBe('`aˋb`');
});

test('every line is quoted', () => {
  expect(quote('one\ntwo')).toBe('> one\n> two');
});
