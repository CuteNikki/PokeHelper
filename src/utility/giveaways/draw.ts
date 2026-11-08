import { randomInt } from 'node:crypto';

/** Someone who can win, with their chances. */
export interface Candidate {
  userId: string;
  entries: number;
}

/**
 * Draw winners at random, each with chances by their entries, so someone with 3 entries is three times as likely as someone with 1.
 * Nobody is drawn twice. When there are fewer candidates than winners, all of them win.
 * @param random A whole number from 0 up to but not including max. Secure by default, so nobody can work out who'll win.
 * @returns The winners, in the order they were drawn.
 */
export function drawWinners(candidates: readonly Candidate[], count: number, random: (max: number) => number = randomInt): string[] {
  const left = candidates.filter((candidate) => candidate.entries > 0);
  const winners: string[] = [];
  let total = left.reduce((sum, candidate) => sum + candidate.entries, 0);

  while (winners.length < count && left.length > 0) {
    let ticket = random(total);
    let index = 0;
    // Walks past everyone whose entries come before the ticket, so the one it lands on is drawn
    while (ticket >= left[index]!.entries) {
      ticket -= left[index]!.entries;
      index++;
    }
    const [winner] = left.splice(index, 1);
    winners.push(winner!.userId);
    total -= winner!.entries;
  }

  return winners;
}
