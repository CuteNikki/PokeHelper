import { beforeAll, expect, test } from 'bun:test';

import { getTranslate, initI18Next } from 'utility/i18next';
import type { ApiEvolutionDetail } from 'utility/pokedex/api';
import { evolutionCondition } from 'utility/pokedex/evolution';
import { setPokedexData } from 'utility/pokedex/names';

beforeAll(async () => {
  await initI18Next();
  setPokedexData({
    species: [{ id: 588, slug: 'karrablast', names: { en: 'Karrablast', de: 'Laukaps' }, forms: [] }],
    items: { 'thunder-stone': { en: 'Thunder Stone', de: 'Donnerstein' }, 'metal-coat': { en: 'Metal Coat', de: 'Metallmantel' } },
    types: { fairy: { en: 'Fairy', de: 'Fee' } },
  });
});

const named = (name: string, path = 'item') => ({ name, url: `https://pokeapi.co/api/v2/${path}/1/` });

/** How it evolves, with only what's given set. */
const detail = (trigger: string, values: Partial<ApiEvolutionDetail> = {}): ApiEvolutionDetail => ({
  trigger: named(trigger, 'evolution-trigger'),
  min_level: null,
  item: null,
  held_item: null,
  known_move: null,
  known_move_type: null,
  location: null,
  min_happiness: null,
  min_beauty: null,
  min_affection: null,
  needs_overworld_rain: false,
  party_species: null,
  party_type: null,
  relative_physical_stats: null,
  time_of_day: '',
  trade_species: null,
  turn_upside_down: false,
  gender: null,
  ...values,
});

test.each([
  ['en', [detail('level-up', { min_level: 16 })], 'Level 16'],
  ['de', [detail('use-item', { item: named('thunder-stone') })], 'Donnerstein'],
  ['en', [detail('level-up', { min_happiness: 160, time_of_day: 'night' })], 'High friendship, at night'],
  ['de', [detail('trade', { held_item: named('metal-coat') })], 'Tausch, hält Metallmantel'],
  ['de', [detail('trade', { trade_species: { name: 'karrablast', url: 'https://pokeapi.co/api/v2/pokemon-species/588/' } })], 'Tausch gegen Laukaps'],
  ['en', [detail('level-up', { min_level: 20, relative_physical_stats: 1 })], 'Level 20, Attack higher than Defense'],
  ['de', [detail('level-up', { known_move_type: named('fairy', 'type'), min_happiness: 160 })], 'Kennt eine Fee-Attacke, hohe Freundschaft'],
  ['en', [detail('spin', { held_item: named('strawberry-sweet') })], 'Spin around, holding Strawberry Sweet'],
  ['en', [detail('mystery')], 'Special condition'],
  ['en', [detail('level-up')], 'Level up'],
])('in %s, %j evolves by "%s"', (language, details, expected) => {
  expect(evolutionCondition(details, language, getTranslate(language))).toBe(expected);
});

test("uses the newest games' way when older games did it differently", () => {
  const leafeon = [
    detail('level-up', { location: named('eterna-forest', 'location') }),
    detail('use-item', { item: named('thunder-stone'), is_default: true }),
    detail('level-up', { location: named('lush-jungle', 'location') }),
  ];
  expect(evolutionCondition(leafeon, 'en', getTranslate('en'))).toBe('Thunder Stone');
  expect(evolutionCondition([detail('level-up', { min_level: 5 }), detail('level-up', { min_level: 7 })], 'en', getTranslate('en'))).toBe('Level 7');
});

test('the first of a chain evolves from nothing', () => {
  expect(evolutionCondition([], 'en', getTranslate('en'))).toBeNull();
});
