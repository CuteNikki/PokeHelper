import { expect, test } from 'bun:test';

import type { Translate } from 'utility/i18next';
import { damageTaken, matchupGroups, matchupsButton, TYPE_EXAMPLES } from 'utility/pokedex/matchups';
import { PAGE_BUTTON_PREFIX, parsePageId } from 'utility/pokedex/pages';
import { TYPE_COLORS } from 'utility/pokedex/types';

const type = (double: string[], half: string[], none: string[] = []) => ({
  double_damage_from: double.map((name) => ({ name, url: '' })),
  half_damage_from: half.map((name) => ({ name, url: '' })),
  no_damage_from: none.map((name) => ({ name, url: '' })),
  // Not what the damage taken goes by
  double_damage_to: [],
  half_damage_to: [],
  no_damage_to: [],
});

const fire = type(['water', 'ground', 'rock'], ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy']);
const flying = type(['electric', 'ice', 'rock'], ['grass', 'fighting', 'bug'], ['ground']);

test('the multipliers of both types are multiplied, and an immunity wins', () => {
  const taken = damageTaken([fire, flying]);
  expect(taken.rock).toBe(4);
  expect(taken.water).toBe(2);
  expect(taken.grass).toBe(0.25);
  expect(taken.ice).toBe(1);
  expect(taken.ground).toBe(0);
  expect(taken.normal).toBe(1);
});

test('the groups go from most to least damage, without neutral damage or empty groups', () => {
  expect(matchupGroups(damageTaken([fire, flying])).map((group) => [group.label, group.types])).toEqual([
    ['×4', ['rock']],
    ['×2', ['water', 'electric']],
    ['×½', ['fire', 'fighting', 'steel', 'fairy']],
    ['×¼', ['grass', 'bug']],
    ['×0', ['ground']],
  ]);
  expect(matchupGroups(damageTaken([type([], [])]))).toEqual([]);
});

test('the Matchups button keeps whether the entry is text, and leads back to it', () => {
  const button = matchupsButton('raichu-alola', { shiny: false, text: true }, ((key: string) => key) as unknown as Translate).toJSON();
  expect('custom_id' in button ? parsePageId(button.custom_id, PAGE_BUTTON_PREFIX) : null).toEqual({
    page: { kind: 'matchups', slug: 'raichu-alola', game: 't' },
    back: { kind: 'pokemon', slug: 'raichu-alola', game: 't' },
  });
});

test('every type has three Pokémon and three moves to use against it', () => {
  for (const type of Object.keys(TYPE_COLORS)) {
    expect(TYPE_EXAMPLES[type]?.pokemon).toHaveLength(3);
    expect(TYPE_EXAMPLES[type]?.moves).toHaveLength(3);
  }
});
