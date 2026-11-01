import type { GuildCounting } from 'generated/prisma/client';

import { parseCount } from 'utility/countingParse';

/** The part of the counting configuration that changes while counting. */
export type CountingState = Pick<
  GuildCounting,
  | 'lastCheckedMessageId'
  | 'lastNumber'
  | 'lastNumberAt'
  | 'lastNumberMessageId'
  | 'lastNumberByUserId'
  | 'highestNumber'
  | 'highestNumberAt'
  | 'highestNumberByUserId'
  | 'highestNumberMessageId'
>;

/** What's needed from a message to check it, so live messages and fetched ones are handled the same. */
export interface CountMessage {
  id: string;
  content: string;
  authorId: string;
  createdAt: Date;
}

export type CountCheck = { result: 'valid'; number: number } | { result: 'consecutive' } | { result: 'wrong' };

/**
 * Check whether a message is the next number in the game.
 * Counting twice in a row is checked first, so the last counter can't send anything until someone else has counted.
 */
export function checkCount(counting: Pick<GuildCounting, 'lastNumber' | 'lastNumberByUserId' | 'allowMath'>, message: CountMessage): CountCheck {
  if (counting.lastNumberByUserId === message.authorId) return { result: 'consecutive' };

  const number = parseCount(message.content, counting.allowMath);
  if (number !== counting.lastNumber + 1) return { result: 'wrong' };

  return { result: 'valid', number };
}

/** The state after a message counted the next number. */
export function applyCount(state: CountingState, number: number, message: CountMessage): CountingState {
  const isHighest = number > state.highestNumber;

  return {
    ...state,
    lastCheckedMessageId: message.id,
    lastNumber: number,
    lastNumberAt: message.createdAt,
    lastNumberMessageId: message.id,
    lastNumberByUserId: message.authorId,
    ...(isHighest && {
      highestNumber: number,
      highestNumberAt: message.createdAt,
      highestNumberByUserId: message.authorId,
      highestNumberMessageId: message.id,
    }),
  };
}

/** The state after a wrong number reset the game. The highest number is kept. */
export function applyReset(state: CountingState, message: CountMessage): CountingState {
  return {
    ...state,
    lastCheckedMessageId: message.id,
    lastNumber: 0,
    lastNumberAt: null,
    lastNumberMessageId: null,
    lastNumberByUserId: null,
  };
}

/** The state after a message was checked without changing the game, like an invalid message that gets deleted. */
export function applyChecked(state: CountingState, message: CountMessage): CountingState {
  return { ...state, lastCheckedMessageId: message.id };
}

export interface ReplayResult {
  state: CountingState;
  /** How many messages counted a number. */
  counted: number;
  /** Messages that broke the rules without resetting the game, which should be deleted. */
  invalidIds: string[];
  /** The resets that happened, with the number that was reached and who sent the wrong number. */
  resets: { number: number; userId: string }[];
}

/**
 * Check messages in order with the same rules as live counting, for catching up on messages sent while the bot was offline.
 * Messages from bots are skipped, like they are when live.
 * @param messages The messages, oldest first.
 */
export function replayCounts(
  state: CountingState,
  counting: Pick<GuildCounting, 'allowMath' | 'resetOnFail'>,
  messages: (CountMessage & { isBot: boolean })[],
): ReplayResult {
  const result: ReplayResult = { state, counted: 0, invalidIds: [], resets: [] };

  for (const message of messages) {
    if (message.isBot) {
      result.state = applyChecked(result.state, message);
      continue;
    }

    const check = checkCount({ ...result.state, allowMath: counting.allowMath }, message);

    if (check.result === 'valid') {
      result.state = applyCount(result.state, check.number, message);
      result.counted++;
    } else if (check.result === 'wrong' && counting.resetOnFail) {
      result.resets.push({ number: result.state.lastNumber, userId: message.authorId });
      result.state = applyReset(result.state, message);
    } else {
      result.state = applyChecked(result.state, message);
      result.invalidIds.push(message.id);
    }
  }

  return result;
}

/** Pick the counting state out of a full configuration. */
export function toCountingState(counting: GuildCounting): CountingState {
  return {
    lastCheckedMessageId: counting.lastCheckedMessageId,
    lastNumber: counting.lastNumber,
    lastNumberAt: counting.lastNumberAt,
    lastNumberMessageId: counting.lastNumberMessageId,
    lastNumberByUserId: counting.lastNumberByUserId,
    highestNumber: counting.highestNumber,
    highestNumberAt: counting.highestNumberAt,
    highestNumberByUserId: counting.highestNumberByUserId,
    highestNumberMessageId: counting.highestNumberMessageId,
  };
}

/** Whether message ID `a` was sent at or before message ID `b`. Snowflakes are ordered by time. */
export const isAtOrBefore = (a: string, b: string) => BigInt(a) <= BigInt(b);
