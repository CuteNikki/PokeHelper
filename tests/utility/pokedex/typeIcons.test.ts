import { expect, test } from 'bun:test';

import { TYPE_COLORS } from 'utility/pokedex/types';
import { typeIconPng, typeSymbol } from 'utility/pokedex/typeIcons';

test('every type has an icon', async () => {
  for (const type of Object.keys(TYPE_COLORS)) {
    expect(await typeSymbol(type)).not.toBeNull();
    expect(await typeIconPng(type, 128)).not.toBeNull();
  }
});

test('a type without one has none, instead of failing', async () => {
  expect(await typeSymbol('stellar')).toBeNull();
  expect(await typeIconPng('stellar', 128)).toBeNull();
});

test('the emoji picture is a PNG', async () => {
  const png = await typeIconPng('fire', 128);
  expect(png?.subarray(1, 4).toString()).toBe('PNG');
});
