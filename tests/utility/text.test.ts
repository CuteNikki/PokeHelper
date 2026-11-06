import { expect, test } from 'bun:test';

import { code } from 'utility/text';

test("backticks in code are swapped, so they can't end it", () => {
  expect(code('a`b')).toBe('`aˋb`');
});
