import { beforeAll, expect, test } from 'bun:test';

import { setPokedexData } from 'utility/pokedex/names';
import { findAnything, searchEverything } from 'utility/pokedex/search';

beforeAll(() =>
  setPokedexData({
    species: [
      { id: 25, slug: 'pikachu', names: { en: 'Pikachu', de: 'Pikachu' }, forms: [] },
      { id: 54, slug: 'psyduck', names: { en: 'Psyduck', de: 'Enton' }, forms: [] },
    ],
    moves: { psychic: { en: 'Psychic', de: 'Psychokinese' }, 'thunder-punch': { en: 'Thunder Punch', de: 'Donnerschlag' } },
    items: { 'cheri-berry': { en: 'Cheri Berry', de: 'Amrenabeere' }, 'up-grade': { en: 'Up-Grade', de: 'Up-Grade' } },
    berries: { cheri: 'cheri-berry' },
    locations: { 'pallet-town': { en: 'Pallet Town', de: 'Alabastia' } },
    locationRegions: { 'pallet-town': 'kanto' },
    regions: { kanto: { en: 'Kanto', de: 'Kanto' } },
  }),
);

test('names starting with what is typed come first, Pokémon before moves', () => {
  expect(searchEverything('psy', 'en', 10).map((result) => `${result.page.kind}:${result.name}`)).toEqual(['pokemon:Psyduck', 'move:Psychic']);
  expect(searchEverything('punch', 'en', 10).map((result) => result.page.slug)).toEqual(['thunder-punch']);
});

test('berries open as berries, and places say their region', () => {
  expect(searchEverything('amren', 'de', 10)[0]).toEqual({ page: { kind: 'berry', slug: 'cheri-berry' }, name: 'Amrenabeere', detail: null });
  expect(searchEverything('pallet', 'en', 10)[0]?.detail).toBe('Kanto');
});

test('numbers only find Pokémon', () => {
  expect(searchEverything('25', 'en', 10).map((result) => result.page)).toEqual([{ kind: 'pokemon', slug: 'pikachu' }]);
});

test('what is typed is found by its exact name in any language, Pokémon first', () => {
  expect(findAnything('Enton')).toEqual({ kind: 'pokemon', slug: 'psyduck' });
  expect(findAnything('Psychokinese')).toEqual({ kind: 'move', slug: 'psychic' });
  expect(findAnything('Alabastia')).toEqual({ kind: 'location', slug: 'pallet-town' });
  expect(findAnything('Psy')).toBeNull();
});
