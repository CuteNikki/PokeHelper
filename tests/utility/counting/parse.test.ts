import { describe, expect, test } from 'bun:test';

import { parseCount } from 'utility/counting/parse';

describe('parseCount without math', () => {
  test.each([
    ['5', 5],
    ['  5  ', 5],
    ['5 nice', 5],
    ['5\nnext line', 5],
    ['1234567', 1234567],
  ])('%p counts as %p', (content, expected) => {
    expect(parseCount(content, false)).toBe(expected);
  });

  test.each(['5abc', '5.9', '05', '0', '-5', 'five', '', 'nice 5', '1+1', '99999999999999999999'])('%p does not count', (content) => {
    expect(parseCount(content, false)).toBeNull();
  });
});

describe('parseCount with math', () => {
  test.each([
    ['5', 5],
    ['5 nice', 5],
    ['1+1', 2],
    ['1*2', 2],
    ['1 + 1', 2],
    ['2 * (3 - 1)', 4],
    ['10 / 2', 5],
    ['3×4', 12],
    ['12÷4', 3],
    ['10 % 3', 1],
    ['2^3', 8],
    ['2**3', 8],
    ['2^3^2', 512],
    ['-2^2 + 8', 4],
    ['2 * -1 + 5', 3],
    ['3!', 6],
    ['(1+2)!', 6],
    ['0.1 * 30', 3],
    ['1.5 * 2', 3],
    ['((2))', 2],
    ['05', 5],
    // Text after the expression, as long as it's separated
    ['1+1 nice', 2],
    ['5 - nice', 5],
    ['2 3', 2],
    ['2 * ', 2],
  ])('%p counts as %p', (content, expected) => {
    expect(parseCount(content, true)).toBe(expected);
  });

  test.each(['1+1abc', '1+', '1.5', '7 / 2', '1 / 0', '0', '1 - 1', '2 - 5', '(2', '2)', '21!', '2.5!', 'abc', '', `${'1+'.repeat(150)}1`])(
    '%p does not count',
    (content) => {
      expect(parseCount(content, true)).toBeNull();
    },
  );
});
