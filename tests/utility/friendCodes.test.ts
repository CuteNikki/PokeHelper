import { describe, expect, test } from 'bun:test';

import { exampleFriendCode, formatFriendCode, parseFriendCode, savedFriendCodes } from 'utility/friendCodes';

describe('parseFriendCode', () => {
  test('takes codes the way they are written, with or without separators and prefix', () => {
    for (const text of ['SW-1234-5678-9012', 'sw 1234 5678 9012', '1234-5678-9012', '123456789012', ' SW123456789012 '])
      expect(parseFriendCode('nintendoSwitch', text)).toBe('123456789012');
    expect(parseFriendCode('pokemonGo', '1234 5678 9012')).toBe('123456789012');
    expect(parseFriendCode('tcgPocket', '1234-5678-9012-3456')).toBe('1234567890123456');
  });

  test('refuses codes with the wrong number of digits or other characters', () => {
    expect(parseFriendCode('nintendoSwitch', '1234-5678-901')).toBeNull();
    expect(parseFriendCode('tcgPocket', '123456789012')).toBeNull();
    expect(parseFriendCode('pokemonGo', 'SW-1234-5678-9012')).toBeNull();
    expect(parseFriendCode('pokemonSleep', '1234-5678-90ab')).toBeNull();
    expect(parseFriendCode('pokemonSleep', '')).toBeNull();
  });
});

test('codes are shown the way each game shows them', () => {
  expect(formatFriendCode('nintendoSwitch', '123456789012')).toBe('SW-1234-5678-9012');
  expect(formatFriendCode('pokemonGo', '123456789012')).toBe('1234 5678 9012');
  expect(formatFriendCode('tcgPocket', '1234567890123456')).toBe('1234-5678-9012-3456');
});

test('every example is a code its game takes', () => {
  for (const game of ['nintendoSwitch', 'pokemonGo', 'pokemonSleep', 'tcgPocket'] as const)
    expect(parseFriendCode(game, exampleFriendCode(game))).not.toBeNull();
});

test('only saved codes are listed, in the order of the games', () => {
  expect(savedFriendCodes({ nintendoSwitch: null, pokemonGo: '1', pokemonSleep: null, tcgPocket: '2' })).toEqual([
    { game: 'pokemonGo', code: '1' },
    { game: 'tcgPocket', code: '2' },
  ]);
  expect(savedFriendCodes(null)).toEqual([]);
});
