import { expect, test } from 'bun:test';

import { pickedGuilds } from 'settings/myBirthday';

test('saved servers that were not listed are kept, and the listed ones are what was picked', () => {
  const listed = ['a', 'b'];
  const saved = ['a', 'hidden'];

  expect(pickedGuilds(['b'], listed, saved)).toEqual(['hidden', 'b']);
  expect(pickedGuilds([], listed, saved)).toEqual(['hidden']);
  expect(pickedGuilds(['a', 'b'], listed, [])).toEqual(['a', 'b']);
});
