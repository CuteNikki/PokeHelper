import { expect, test } from 'bun:test';

import { iconNames, iconPng } from 'utility/icons';

test('every icon can be made in both looks', async () => {
  expect(iconNames().length).toBeGreaterThan(0);
  for (const name of iconNames()) {
    expect((await iconPng(name, 'button', 128))?.subarray(1, 4).toString()).toBe('PNG');
    expect((await iconPng(name, 'text', 128))?.subarray(1, 4).toString()).toBe('PNG');
  }
});

test("an icon that isn't there is null, instead of failing", async () => {
  expect(await iconPng('nothing-like-this', 'button', 128)).toBeNull();
});
