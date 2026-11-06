import { expect, test } from 'bun:test';

import type { ApiEncounter } from 'utility/pokedex/api';
import { placesByGame } from 'utility/pokedex/encounters';
import { setPokedexData } from 'utility/pokedex/names';

const version = (name: string, id: number) => ({ name, url: `https://pokeapi.co/api/v2/version/${id}/` });
const method = (name: string) => ({ name, url: `https://pokeapi.co/api/v2/encounter-method/1/` });

const encounters: ApiEncounter[] = [
  {
    location_area: { name: 'viridian-forest-area', url: '' },
    version_details: [
      {
        version: version('red', 1),
        max_chance: 5,
        encounter_details: [
          { min_level: 3, max_level: 3, chance: 4, method: method('walk') },
          { min_level: 5, max_level: 5, chance: 1, method: method('walk') },
        ],
      },
      { version: version('sword', 34), max_chance: 870, encounter_details: [{ min_level: 10, max_level: 60, chance: 870, method: method('overworld') }] },
    ],
  },
  {
    location_area: { name: 'kanto-route-2-area', url: '' },
    version_details: [{ version: version('red', 1), max_chance: 20, encounter_details: [{ min_level: 2, max_level: 4, chance: 20, method: method('surf') }] }],
  },
];

test('groups the places by game, newest first, with the best chances first and the levels of all ways together', () => {
  setPokedexData({ versionOrder: { red: 1001, sword: 8020 } });
  expect(placesByGame(encounters)).toEqual([
    { version: 'sword', sightings: [{ name: 'viridian-forest-area', methods: ['overworld'], minLevel: 10, maxLevel: 60, chance: 100 }] },
    {
      version: 'red',
      sightings: [
        { name: 'kanto-route-2-area', methods: ['surf'], minLevel: 2, maxLevel: 4, chance: 20 },
        { name: 'viridian-forest-area', methods: ['walk'], minLevel: 3, maxLevel: 5, chance: 5 },
      ],
    },
  ]);
});

test("goes by PokéAPI's numbers for games without an order", () => {
  setPokedexData({});
  expect(placesByGame(encounters).map((game) => game.version)).toEqual(['sword', 'red']);
});
