import { createCanvas, loadImage } from '@napi-rs/canvas';
import { beforeAll, describe, expect, test } from 'bun:test';

import { generationOf, guessCustomId, hintsOf, nameHint, newGame, parseGuessCustomId, renderGuessPicture } from 'utility/pokedex/guess';
import { isNameOf, setPokedexData, speciesById } from 'utility/pokedex/names';

beforeAll(() =>
  setPokedexData({
    species: [
      { id: 6, slug: 'charizard', names: { en: 'Charizard', de: 'Glurak' }, forms: [] },
      { id: 26, slug: 'raichu', names: { en: 'Raichu', de: 'Raichu' }, forms: [{ slug: 'raichu-alola', names: { en: 'Alolan Raichu', de: 'Alola-Raichu' } }] },
      { id: 122, slug: 'mr-mime', names: { en: 'Mr. Mime', de: 'Pantimos' }, forms: [] },
      { id: 252, slug: 'treecko', names: { en: 'Treecko', de: 'Geckarbor' }, forms: [] },
    ],
    abilities: {},
    types: {},
  }),
);

describe('custom IDs', () => {
  test('keep the whole game', () => {
    const game = { speciesId: 6, generation: 1, guesses: 3, hints: 2 };
    expect(parseGuessCustomId(guessCustomId('hint', game))).toEqual({ action: 'hint', game });
    expect(parseGuessCustomId(guessCustomId('again', { ...game, generation: null }))?.game.generation).toBeNull();
  });

  test("aren't games when they're something else", () => {
    expect(parseGuessCustomId('guess:dance:6:0:0:0')).toBeNull();
    expect(parseGuessCustomId('guess:hint:6:0:0')).toBeNull();
    expect(parseGuessCustomId('guess:hint:6:12:0:0')).toBeNull();
    expect(parseGuessCustomId('pokedex:next:pikachu:n:i')).toBeNull();
  });
});

test('generationOf goes by the last number of each generation', () => {
  expect(generationOf(1)).toBe(1);
  expect(generationOf(151)).toBe(1);
  expect(generationOf(152)).toBe(2);
  expect(generationOf(1025)).toBe(9);
  expect(generationOf(2000)).toBe(9);
});

test('isNameOf takes its name in any language, and of its forms, but not of others', () => {
  const charizard = speciesById(6)!;
  expect(isNameOf(charizard, 'glurak')).toBe(true);
  expect(isNameOf(charizard, ' Charizard ')).toBe(true);
  expect(isNameOf(speciesById(26)!, 'alola raichu')).toBe(true);
  expect(isNameOf(speciesById(122)!, 'mr mime')).toBe(true);
  expect(isNameOf(charizard, 'Raichu')).toBe(false);
  expect(isNameOf(charizard, '')).toBe(false);
});

test('nameHint shows the first letter, a blank for every other, and keeps spaces and dots', () => {
  expect(nameHint('Glurak')).toBe('G _ _ _ _ _');
  expect(nameHint('Mr. Mime')).toBe('M _ .   _ _ _ _');
});

test("hintsOf leaves out the generation when the game was picked from one, as it's known", () => {
  expect(hintsOf({ speciesId: 6, generation: null, guesses: 0, hints: 0 })).toEqual(['types', 'generation', 'name']);
  expect(hintsOf({ speciesId: 6, generation: 1, guesses: 0, hints: 0 })).toEqual(['types', 'name']);
});

describe('newGame', () => {
  test('picks from the generation', () => {
    for (let i = 0; i < 20; i++) expect(newGame(3)?.speciesId).toBe(252);
  });

  test("doesn't pick the one just played when there's another", () => {
    for (let i = 0; i < 20; i++) expect(newGame(1, 6)?.speciesId).not.toBe(6);
    // Unless it's the only one there is
    expect(newGame(3, 252)?.speciesId).toBe(252);
  });

  test('has nothing to pick from an empty generation', () => {
    expect(newGame(9)).toBeNull();
  });
});

describe('renderGuessPicture', () => {
  // A red square, standing in for the artwork
  const artwork = async () => {
    const canvas = createCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 100, 100);
    return loadImage(canvas.toBuffer('image/png'));
  };
  const centerOf = async (png: Buffer) => {
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(image.width / 2, image.height / 2, 1, 1).data];
  };

  test('hides the colors while guessing, and shows them once it is over', async () => {
    const image = await artwork();
    const [red, , , alpha] = await centerOf(renderGuessPicture(image, true));
    expect(red).toBeLessThan(60);
    expect(alpha).toBe(255);
    expect(await centerOf(renderGuessPicture(image, false))).toEqual([255, 0, 0, 255]);
  });
});
