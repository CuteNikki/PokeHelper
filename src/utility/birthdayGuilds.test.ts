import { expect, test } from 'bun:test';

import { NO_GUILDS, pickedGuilds } from 'utility/birthdayGuilds';

test('saved servers that were not in the select are kept, and picking no servers clears the shown ones', () => {
  const shown = [NO_GUILDS, 'a', 'b'];
  const saved = ['a', 'hidden'];

  expect(pickedGuilds(['b'], shown, saved)).toEqual(['hidden', 'b']);
  expect(pickedGuilds([NO_GUILDS, 'a'], shown, saved)).toEqual(['hidden']);
  expect(pickedGuilds(['a', 'b'], shown, [])).toEqual(['a', 'b']);
});
