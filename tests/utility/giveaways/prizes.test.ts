import { describe, expect, test } from 'bun:test';

import { MAX_PLACE_PRIZE_LENGTH, MAX_PLACE_PRIZES, MAX_WINNERS } from 'database/giveaways';

import { formatPlacePrizes, groupByPrize, parsePlacePrizes, prizeList, prizePlan } from 'utility/giveaways/prizes';

const giveaway = (winnerCount: number, prizes: { name: string; count: number }[] = []) => ({
  prize: 'Poke Ball',
  winnerCount,
  prizes: prizes.map((prize, position) => ({ giveawayId: 'g', position, ...prize })),
});

describe('parsePlacePrizes', () => {
  test('reads counts in front, with or without x, and one without a count', () => {
    expect(parsePlacePrizes('1x Shiny Charizard\n2 Rare Candy\n\n  Master Ball  ')).toEqual([
      { name: 'Shiny Charizard', count: 1 },
      { name: 'Rare Candy', count: 2 },
      { name: 'Master Ball', count: 1 },
    ]);
  });

  test('takes a name that starts with a number as a name', () => {
    expect(parsePlacePrizes('3DS')).toEqual([{ name: '3DS', count: 1 }]);
  });

  test('says what is wrong', () => {
    expect(parsePlacePrizes('0x Nothing')).toBe('invalid');
    expect(parsePlacePrizes(`${MAX_WINNERS + 1}x Too many`)).toBe('invalid');
    expect(parsePlacePrizes(Array.from({ length: MAX_PLACE_PRIZES + 1 }, (_, i) => `Prize ${i}`).join('\n'))).toBe('tooMany');
    expect(parsePlacePrizes(`1x ${'a'.repeat(MAX_PLACE_PRIZE_LENGTH + 1)}`)).toBe('tooLong');
  });

  test('reads back what it formats', () => {
    const prizes = [
      { name: 'Shiny Charizard', count: 1 },
      { name: 'Rare Candy', count: 2 },
    ];
    expect(parsePlacePrizes(formatPlacePrizes(prizes))).toEqual(prizes);
  });
});

describe('prizePlan', () => {
  test('gives the first places their prizes and the rest the main prize', () => {
    expect(
      prizePlan(
        giveaway(5, [
          { name: 'A', count: 1 },
          { name: 'B', count: 2 },
        ]),
      ),
    ).toEqual(['A', 'B', 'B', null, null]);
  });

  test('leaves out places past the number of winners', () => {
    expect(prizePlan(giveaway(2, [{ name: 'A', count: 3 }]))).toEqual(['A', 'A']);
  });

  test('gives everyone the main prize without prizes by place', () => {
    expect(prizePlan(giveaway(2))).toEqual([null, null]);
  });
});

describe('prizeList', () => {
  test('lists each prize with how many get it, and the main prize for the rest', () => {
    expect(
      prizeList(
        giveaway(5, [
          { name: 'A', count: 1 },
          { name: 'B', count: 2 },
        ]),
      ),
    ).toEqual([
      { name: 'A', count: 1 },
      { name: 'B', count: 2 },
      { name: 'Poke Ball', count: 2 },
    ]);
  });

  test('cuts prizes off at the number of winners', () => {
    expect(
      prizeList(
        giveaway(2, [
          { name: 'A', count: 1 },
          { name: 'B', count: 5 },
        ]),
      ),
    ).toEqual([
      { name: 'A', count: 1 },
      { name: 'B', count: 1 },
    ]);
  });

  test('is empty without prizes by place', () => {
    expect(prizeList(giveaway(3))).toEqual([]);
  });
});

describe('groupByPrize', () => {
  test('groups winners by what they won, in order, with the main prize for those without one', () => {
    const groups = groupByPrize({ prize: 'Poke Ball' }, [
      { userId: 'ash', prize: 'A' },
      { userId: 'misty', prize: null },
      { userId: 'brock', prize: 'A' },
    ]);
    expect(groups.map((group) => [group.prize, group.winners.map((winner) => winner.userId)])).toEqual([
      ['A', ['ash', 'brock']],
      ['Poke Ball', ['misty']],
    ]);
  });
});
