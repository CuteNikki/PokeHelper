import { beforeAll, describe, expect, test } from 'bun:test';

import { parsePokedexCustomId, parsePokedexFormSelectId, pokedexCustomId } from 'utility/pokedex';
import { findBySlug, findPokemon, formatDexNumber, searchPokemon, setPokedexData } from 'utility/pokedexData';

beforeAll(() =>
  setPokedexData({
    species: [
      { id: 25, slug: 'pikachu', names: { en: 'Pikachu', de: 'Pikachu' }, forms: [] },
      { id: 26, slug: 'raichu', names: { en: 'Raichu', de: 'Raichu' }, forms: [{ slug: 'raichu-alola', names: { en: 'Alolan Raichu', de: 'Alola-Raichu' } }] },
      { id: 122, slug: 'mr-mime', names: { en: 'Mr. Mime', de: 'Pantimos' }, forms: [] },
      { id: 669, slug: 'flabebe', names: { en: 'Flabébé', de: 'Flabébé' }, forms: [] },
      { id: 6, slug: 'charizard', names: { en: 'Charizard', de: 'Glurak' }, forms: [] },
    ],
    abilities: {},
    types: {},
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

test('formatDexNumber pads to four digits like the games', () => {
  expect(formatDexNumber(25)).toBe('#0025');
  expect(formatDexNumber(1025)).toBe('#1025');
});

describe('custom IDs', () => {
  test('a button leads back to the Pokémon and shininess it was made with', () => {
    expect(parsePokedexCustomId(pokedexCustomId('next', 'raichu-alola', true))).toEqual({ slug: 'raichu-alola', shiny: true });
    expect(parsePokedexCustomId(pokedexCustomId('shiny', 'pikachu', false))).toEqual({ slug: 'pikachu', shiny: false });
  });

  test("other or broken custom IDs aren't taken", () => {
    expect(parsePokedexCustomId('pokedex:form:s')).toBeNull();
    expect(parsePokedexCustomId('pokedex:next:pikachu:x')).toBeNull();
    expect(parsePokedexCustomId('lb:next:1:desc:a:i')).toBeNull();
  });

  test('the forms select keeps whether the pictures are shiny', () => {
    expect(parsePokedexFormSelectId('pokedex:form:s')).toEqual({ shiny: true });
    expect(parsePokedexFormSelectId('pokedex:form:n')).toEqual({ shiny: false });
    expect(parsePokedexFormSelectId('pokedex:next:pikachu:n')).toBeNull();
  });
});
