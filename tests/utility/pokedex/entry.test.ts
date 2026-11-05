import { describe, expect, test } from 'bun:test';

import { parsePokedexCustomId, parsePokedexFormSelectId, pokedexCustomId } from 'utility/pokedex/entry';

describe('custom IDs', () => {
  test('a button leads back to the Pokémon and view it was made with', () => {
    expect(parsePokedexCustomId(pokedexCustomId('mode', 'eevee', { shiny: true, text: true }))).toEqual({
      action: 'mode',
      slug: 'eevee',
      view: { shiny: true, text: true },
    });
    expect(parsePokedexCustomId(pokedexCustomId('next', 'raichu-alola', { shiny: true, text: false }))).toEqual({
      action: 'next',
      slug: 'raichu-alola',
      view: { shiny: true, text: false },
    });
    expect(parsePokedexCustomId(pokedexCustomId('shiny', 'pikachu', { shiny: false, text: true }))).toEqual({
      action: 'shiny',
      slug: 'pikachu',
      view: { shiny: false, text: true },
    });
    expect(parsePokedexCustomId(pokedexCustomId('evo', 'raichu', { shiny: false, text: false }))).toEqual({
      action: 'evo',
      slug: 'raichu',
      view: { shiny: false, text: false },
    });
  });

  test('the search button keeps the view of the entry it was pressed on', () => {
    expect(parsePokedexCustomId(pokedexCustomId('search', 'mewtwo-mega-x', { shiny: false, text: true }))).toEqual({
      action: 'search',
      slug: 'mewtwo-mega-x',
      view: { shiny: false, text: true },
    });
  });

  test('buttons from before the text mode still work, and show the card', () => {
    expect(parsePokedexCustomId('pokedex:next:pikachu:s')).toEqual({ action: 'next', slug: 'pikachu', view: { shiny: true, text: false } });
  });

  test("other or broken custom IDs aren't taken", () => {
    expect(parsePokedexCustomId('pokedex:form:s')).toBeNull();
    expect(parsePokedexCustomId('pokedex:next:pikachu:x')).toBeNull();
    expect(parsePokedexCustomId('pokedex:next:pikachu:n:x')).toBeNull();
    expect(parsePokedexCustomId('lb:next:1:desc:a:i')).toBeNull();
  });

  test('the forms select keeps the view', () => {
    expect(parsePokedexFormSelectId('pokedex:form:s:t')).toEqual({ shiny: true, text: true });
    expect(parsePokedexFormSelectId('pokedex:form:n')).toEqual({ shiny: false, text: false });
    expect(parsePokedexFormSelectId('pokedex:next:pikachu:n')).toBeNull();
  });
});
