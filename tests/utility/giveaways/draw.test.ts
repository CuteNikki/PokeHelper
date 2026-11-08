import { describe, expect, test } from 'bun:test';

import { drawWinners } from 'utility/giveaways/draw';

/** Always draws the given tickets, one after the other. */
const tickets =
  (...values: number[]) =>
  () =>
    values.shift() ?? 0;

const candidates = [
  { userId: 'ash', entries: 1 },
  { userId: 'misty', entries: 3 },
  { userId: 'brock', entries: 2 },
];

describe('drawing winners', () => {
  test('a ticket lands on whoever holds it, by entries', () => {
    // Tickets 0 | 1 2 3 | 4 5
    expect(drawWinners(candidates, 1, tickets(0))).toEqual(['ash']);
    expect(drawWinners(candidates, 1, tickets(1))).toEqual(['misty']);
    expect(drawWinners(candidates, 1, tickets(3))).toEqual(['misty']);
    expect(drawWinners(candidates, 1, tickets(4))).toEqual(['brock']);
    expect(drawWinners(candidates, 1, tickets(5))).toEqual(['brock']);
  });

  test('nobody wins twice, as winners are drawn from the ones left', () => {
    // Misty holds tickets 1 to 3, after her Ash 0 and Brock 1 and 2
    expect(drawWinners(candidates, 3, tickets(2, 1, 0))).toEqual(['misty', 'brock', 'ash']);
  });

  test('draws from all tickets left each time', () => {
    const maxes: number[] = [];
    drawWinners(candidates, 3, (max) => {
      maxes.push(max);
      return 0;
    });
    expect(maxes).toEqual([6, 5, 2]);
  });

  test('everyone wins when there are fewer candidates than winners', () => {
    expect(drawWinners(candidates, 10, tickets(0, 0, 0)).sort()).toEqual(['ash', 'brock', 'misty']);
    expect(drawWinners([], 3)).toEqual([]);
  });

  test('is fair over many draws', () => {
    const wins: Record<string, number> = { ash: 0, misty: 0, brock: 0 };
    for (let i = 0; i < 60_000; i++) wins[drawWinners(candidates, 1)[0]!]!++;
    expect(wins.ash! / 60_000).toBeCloseTo(1 / 6, 1);
    expect(wins.misty! / 60_000).toBeCloseTo(3 / 6, 1);
    expect(wins.brock! / 60_000).toBeCloseTo(2 / 6, 1);
  });
});
