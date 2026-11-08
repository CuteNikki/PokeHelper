import { type Giveaway, MAX_PLACE_PRIZE_LENGTH, MAX_PLACE_PRIZES, MAX_WINNERS, type PlacePrize } from 'database/giveaways';

/** A line of the prizes by place: a count in front, like `2x Rare Candy` or `2 Rare Candy`, or just a name, for one winner. */
const LINE = /^(?:(\d+)\s*x?\s+)?(.+)$/i;

/** Why prizes by place can't be used: a line isn't one, there are too many, or a name is too long. */
export type PrizesError = 'invalid' | 'tooMany' | 'tooLong';

/** Read prizes by place as typed, one per line, like `1x Shiny Charizard`. Empty lines are skipped. */
export function parsePlacePrizes(text: string): PlacePrize[] | PrizesError {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > MAX_PLACE_PRIZES) return 'tooMany';
  const prizes: PlacePrize[] = [];
  for (const line of lines) {
    const match = LINE.exec(line);
    const count = match?.[1] ? Number(match[1]) : 1;
    const name = match?.[2]?.trim();
    if (!name || count < 1 || count > MAX_WINNERS) return 'invalid';
    if (name.length > MAX_PLACE_PRIZE_LENGTH) return 'tooLong';
    prizes.push({ name, count });
  }
  return prizes;
}

/** Prizes by place as they're typed, so the setting shows them like they were entered. */
export const formatPlacePrizes = (prizes: PlacePrize[]) => prizes.map((prize) => `${prize.count}x ${prize.name}`).join('\n');

/**
 * The prize of each place, in the order winners are drawn: the prizes by place first, then the giveaway's prize for the rest, which is
 * null. Places past the giveaway's number of winners aren't given.
 */
export function prizePlan(giveaway: Pick<Giveaway, 'prizes' | 'winnerCount'>): (string | null)[] {
  const plan = giveaway.prizes.flatMap((prize) => Array.from({ length: prize.count }, () => prize.name));
  return Array.from({ length: giveaway.winnerCount }, (_, index) => plan[index] ?? null);
}

/** What a winner won: their prize by place, or else the giveaway's prize. */
export const prizeOf = (giveaway: Pick<Giveaway, 'prize'>, winner: { prize: string | null }) => winner.prize ?? giveaway.prize;

/**
 * Which prizes a giveaway gives, for the post: each prize by place with how many get it, then the giveaway's prize for the rest.
 * Empty without prizes by place, as then the giveaway's prize is all there is.
 */
export function prizeList(giveaway: Pick<Giveaway, 'prize' | 'prizes' | 'winnerCount'>): PlacePrize[] {
  if (giveaway.prizes.length === 0) return [];
  const list: PlacePrize[] = [];
  let left = giveaway.winnerCount;
  for (const prize of giveaway.prizes) {
    const count = Math.min(prize.count, left);
    if (count > 0) list.push({ name: prize.name, count });
    left -= count;
  }
  if (left > 0) list.push({ name: giveaway.prize, count: left });
  return list;
}

/** Winners grouped by what they won, in the order of the places, for saying who won what. */
export function groupByPrize<W extends { userId: string | null; prize: string | null }>(giveaway: Pick<Giveaway, 'prize'>, winners: W[]) {
  const groups: { prize: string; winners: W[] }[] = [];
  for (const winner of winners) {
    const prize = prizeOf(giveaway, winner);
    const group = groups.find((other) => other.prize === prize);
    if (group) group.winners.push(winner);
    else groups.push({ prize, winners: [winner] });
  }
  return groups;
}
