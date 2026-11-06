import { beforeAll, describe, expect, test } from 'bun:test';

import { findBySlug, findNamed, findPokemon, formatDexNumber, nameOf, namesFromLists, searchNamed, searchPokemon, setPokedexData } from 'utility/pokedex/names';

beforeAll(() =>
  setPokedexData({
    species: [
      { id: 25, slug: 'pikachu', names: { en: 'Pikachu', de: 'Pikachu' }, forms: [] },
      { id: 26, slug: 'raichu', names: { en: 'Raichu', de: 'Raichu' }, forms: [{ slug: 'raichu-alola', names: { en: 'Alolan Raichu', de: 'Alola-Raichu' } }] },
      { id: 122, slug: 'mr-mime', names: { en: 'Mr. Mime', de: 'Pantimos' }, forms: [] },
      { id: 669, slug: 'flabebe', names: { en: 'Flabébé', de: 'Flabébé' }, forms: [] },
      { id: 6, slug: 'charizard', names: { en: 'Charizard', de: 'Glurak' }, forms: [] },
    ],
    items: {
      'thunder-stone': { en: 'Thunder Stone', de: 'Donnerstein' },
      'cheri-berry': { en: 'Cheri Berry', de: 'Amrenabeere' },
      'master-ball': { en: 'Master Ball', de: 'Meisterball' },
    },
    berries: { cheri: 'cheri-berry' },
  }),
);

describe('findPokemon', () => {
  test('finds a Pokémon by its number, with or without #', () => {
    expect(findPokemon('25')?.species.slug).toBe('pikachu');
    expect(findPokemon('#026')?.species.slug).toBe('raichu');
    expect(findPokemon('9999')).toBeNull();
  });

  test('finds a Pokémon by its name in any language, without caring about case, accents or punctuation', () => {
    expect(findPokemon('Glurak')?.species.slug).toBe('charizard');
    expect(findPokemon('mr mime')?.species.slug).toBe('mr-mime');
    expect(findPokemon('flabebe')?.species.slug).toBe('flabebe');
    expect(findPokemon('Alola-Raichu')?.form?.slug).toBe('raichu-alola');
  });

  test('finds nothing for a name that only starts like one', () => {
    expect(findPokemon('pika')).toBeNull();
    expect(findPokemon('  ')).toBeNull();
  });
});

describe('searchPokemon', () => {
  test('puts names starting with the text before names containing it, forms included', () => {
    expect(searchPokemon('rai', 5).map((match) => (match.form ?? match.species).slug)).toEqual(['raichu', 'raichu-alola']);
    expect(searchPokemon('chu', 5).map((match) => (match.form ?? match.species).slug)).toEqual(['pikachu', 'raichu', 'raichu-alola']);
  });

  test('finds numbers starting with the typed number', () => {
    expect(searchPokemon('2', 5).map((match) => match.species.id)).toEqual([25, 26]);
  });

  test('suggests the first Pokémon when nothing is typed, up to the limit', () => {
    expect(searchPokemon('', 2)).toHaveLength(2);
  });
});

test('findBySlug finds species and forms by the exact slug', () => {
  expect(findBySlug('raichu')?.form).toBeNull();
  expect(findBySlug('raichu-alola')?.form?.slug).toBe('raichu-alola');
  expect(findBySlug('raichualola')).toBeNull();
});

describe('findNamed and searchNamed', () => {
  const berry = (slug: string) => slug.endsWith('-berry');

  test('find an item by its slug or its name in any language', () => {
    expect(findNamed('items', 'Donnerstein')).toBe('thunder-stone');
    expect(findNamed('items', 'master ball')).toBe('master-ball');
    expect(findNamed('items', 'Meister')).toBeNull();
    expect(findNamed('items', 'Master Ball', berry)).toBeNull();
  });

  test('suggest names starting with the text first, then names containing it, only the ones asked for', () => {
    expect(searchNamed('items', 'stein', 5)).toEqual(['thunder-stone']);
    expect(searchNamed('items', 'm', 5)).toEqual(['master-ball', 'cheri-berry']);
    expect(searchNamed('items', '', 5, berry)).toEqual(['cheri-berry']);
  });

  test('nameOf makes a name from the slug when there is none', () => {
    expect(nameOf('items', 'cheri-berry', 'de')).toBe('Amrenabeere');
    expect(nameOf('moves', 'thunder-punch', 'de')).toBe('Thunder Punch');
  });
});

test('formatDexNumber pads to four digits like the games', () => {
  expect(formatDexNumber(25)).toBe('#0025');
  expect(formatDexNumber(1025)).toBe('#1025');
});

test('namesFromLists makes names from slugs and puts forms with the species their slug starts with', () => {
  const listed = (names: [string, number][], path: string) => names.map(([name, id]) => ({ name, url: `https://pokeapi.co/api/v2/${path}/${id}/` }));
  const data = namesFromLists(
    {
      species: listed(
        [
          ['mr-mime', 122],
          ['raichu', 26],
          ['porygon', 137],
          ['porygon-z', 474],
        ],
        'pokemon-species',
      ),
      pokemon: listed(
        [
          ['raichu', 26],
          ['mr-mime', 122],
          ['porygon', 137],
          ['porygon-z', 474],
          ['raichu-alola', 10100],
          ['mr-mime-galar', 10168],
        ],
        'pokemon',
      ),
      types: listed([['fire', 10]], 'type'),
      abilities: listed([['static', 9]], 'ability'),
      berries: listed([['cheri', 1]], 'berry'),
    },
    ['en', 'de'],
  );

  expect(data.species.map((species) => [species.id, species.names.de, species.forms.map((form) => form.names.en)])).toEqual([
    [26, 'Raichu', ['Raichu Alola']],
    [122, 'Mr Mime', ['Mr Mime Galar']],
    [137, 'Porygon', []],
    [474, 'Porygon Z', []],
  ]);
  expect(data.types.fire).toEqual({ en: 'Fire', de: 'Fire' });
  expect(data.berries).toEqual({ cheri: 'cheri-berry' });
  expect(data.items).toEqual({});
});
