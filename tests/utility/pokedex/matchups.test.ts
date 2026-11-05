import { expect, test } from 'bun:test';

import { damageTaken, matchupGroups } from 'utility/pokedex/matchups';

const type = (double: string[], half: string[], none: string[] = []) => ({
  double_damage_from: double.map((name) => ({ name, url: '' })),
  half_damage_from: half.map((name) => ({ name, url: '' })),
  no_damage_from: none.map((name) => ({ name, url: '' })),
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
