import { readdirSync } from 'node:fs';

import { expect, test } from 'bun:test';

import { ICON_NAMES, ICONS_PATH, iconPng } from 'utility/icons';

test('the list of icons and their files match', () => {
  const files = readdirSync(ICONS_PATH)
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -4));
  // An icon without its file would never show, and a file without a name could never be used
  expect([...ICON_NAMES].sort() as string[]).toEqual(files.sort());
});

test('every icon can be made in both looks', async () => {
  for (const name of ICON_NAMES) {
    expect((await iconPng(name, 'button', 128))?.subarray(1, 4).toString()).toBe('PNG');
    expect((await iconPng(name, 'text', 128))?.subarray(1, 4).toString()).toBe('PNG');
  }
});
