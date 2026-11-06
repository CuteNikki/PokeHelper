import { expect, test } from 'bun:test';

import { decodePage, encodePage, gameSelectId, PAGE_BUTTON_PREFIX, PAGE_GAME_PREFIX, pageButton, parsePageId } from 'utility/pokedex/pages';

test('a page is written and read back the same, with its game when it has one', () => {
  expect(decodePage(encodePage({ kind: 'move', slug: 'thunderbolt' }))).toEqual({ kind: 'move', slug: 'thunderbolt', game: null });
  expect(decodePage(encodePage({ kind: 'location', slug: 'sinnoh-pokemon-league', game: 'platinum' }))).toEqual({
    kind: 'location',
    slug: 'sinnoh-pokemon-league',
    game: 'platinum',
  });
});

test("what isn't a page isn't read as one", () => {
  expect(decodePage('spell:fireball')).toBeNull();
  expect(decodePage('move')).toBeNull();
  expect(decodePage('move:a:b:c')).toBeNull();
  expect(decodePage(undefined)).toBeNull();
});

test('a button keeps the page it was on, for the Back button where it leads', () => {
  const id = pageButton({ kind: 'where', slug: 'pikachu' }, { kind: 'pokemon', slug: 'pikachu' }).setLabel('Where to find').toJSON();
  expect('custom_id' in id ? parsePageId(id.custom_id, PAGE_BUTTON_PREFIX) : null).toEqual({
    page: { kind: 'where', slug: 'pikachu', game: null },
    back: { kind: 'pokemon', slug: 'pikachu', game: null },
  });
});

test('the way back is left out when both pages are too long for a custom ID', () => {
  const long = 'a'.repeat(60);
  const id = gameSelectId({ kind: 'location', slug: long, game: 'red' }, { kind: 'location', slug: long });
  expect(id.length).toBeLessThanOrEqual(100);
  expect(parsePageId(id, PAGE_GAME_PREFIX)).toEqual({ page: { kind: 'location', slug: long, game: null }, back: null });
});
