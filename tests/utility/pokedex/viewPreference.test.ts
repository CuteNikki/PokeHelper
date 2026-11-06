import { expect, test } from 'bun:test';

import { withPreferredView } from 'utility/pokedex/pageRender';
import { pokemonPage, pokemonView } from 'utility/pokedex/pages';
import { prefersTextView, rememberTextView } from 'utility/pokedex/viewPreference';

test("a Pokémon's page says how it's shown, and reads back the same", () => {
  expect(pokemonPage('pikachu', { shiny: false, text: false })).toEqual({ kind: 'pokemon', slug: 'pikachu', game: null });
  expect(pokemonView(pokemonPage('pikachu', { shiny: true, text: true }))).toEqual({ shiny: true, text: true });
  expect(pokemonView(pokemonPage('pikachu', { shiny: false, text: true }))).toEqual({ shiny: false, text: true });
});

test('a Pokémon opened without saying is shown how its viewer last looked at one', () => {
  rememberTextView('reader', true);
  expect(prefersTextView('reader')).toBe(true);
  expect(prefersTextView('someone else')).toBe(false);
  expect(withPreferredView({ page: { kind: 'pokemon', slug: 'pikachu' }, back: null }, 'reader').page).toEqual({ kind: 'pokemon', slug: 'pikachu', game: 't' });
  expect(withPreferredView({ page: { kind: 'types', slug: 'all' }, back: null }, 'reader').page.slug).toBe('text');
});

test('one that says how is shown so, and remembered', () => {
  withPreferredView({ page: pokemonPage('pikachu', { shiny: true, text: false }), back: null }, 'switcher');
  expect(prefersTextView('switcher')).toBe(false);
  withPreferredView({ page: { kind: 'types', slug: 'text' }, back: null }, 'switcher');
  expect(prefersTextView('switcher')).toBe(true);
});
