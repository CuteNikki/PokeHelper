import { expect, test } from 'bun:test';
import { Collection } from 'discord.js';

import { findHandler } from 'utility/customId';

const handler = (customId: string, includesCustomId = true) => ({ options: { customId, includesCustomId } });
const handlers = new Collection(
  [handler('lb:'), handler('lb:sort:'), handler('settings:'), handler('help:category', false)].map((entry) => [entry.options.customId, entry]),
);

test('a prefix only counts at the start, so IDs inside other IDs go to the right handler', () => {
  // A role menu ID ending in "lb" contains "lb:" further on
  expect(findHandler(handlers, 'settings:rolemenu-cm3x9lb:roles:_:-')?.options.customId).toBe('settings:');
});

test('the longest prefix wins, and exact IDs come first', () => {
  expect(findHandler(handlers, 'lb:sort:1:desc:a:i')?.options.customId).toBe('lb:sort:');
  expect(findHandler(handlers, 'lb:next:2:desc:a:i')?.options.customId).toBe('lb:');
  expect(findHandler(handlers, 'help:category')?.options.customId).toBe('help:category');
  expect(findHandler(handlers, 'help:category:x')).toBeUndefined();
  expect(findHandler(handlers, 'unknown:')).toBeUndefined();
});
