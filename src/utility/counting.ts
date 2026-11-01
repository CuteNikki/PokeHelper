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

/** Something that happened in the game, which is recorded for the stats along with the new state. */
export type CountingEvent =
  | { type: 'count'; number: number; userId: string; messageId: string; at: Date }
  | { type: 'mistake'; userId: string }
  /** A wrong number ended the run at `number`. */
  | { type: 'reset'; number: number; userId: string; at: Date };

export interface ProcessedCount {
  state: CountingState;
  /**
   * - valid: the next number was counted
   * - reset: a wrong number reset the game
   * - invalid: the message broke the rules and should be deleted
   * - skipped: a bot message, which is ignored
   */
  outcome: 'valid' | 'reset' | 'invalid' | 'skipped';
  /** The result of the check, or null for skipped messages. */
  check: CountCheck | null;
  events: CountingEvent[];
}

/**
 * Check a message and work out everything that follows from it: the new state, what should happen to the message, and what to record.
 * Live counting and catching up both go through here, so they follow exactly the same rules.
 */
export function processCount(
  state: CountingState,
  counting: Pick<GuildCounting, 'allowMath' | 'resetOnFail'>,
  message: CountMessage & { isBot?: boolean },
): ProcessedCount {
  if (message.isBot) return { state: applyChecked(state, message), outcome: 'skipped', check: null, events: [] };

  const check = checkCount({ ...state, allowMath: counting.allowMath }, message);

  if (check.result === 'valid') {
    return {
      state: applyCount(state, check.number, message),
      outcome: 'valid',
      check,
      events: [{ type: 'count', number: check.number, userId: message.authorId, messageId: message.id, at: message.createdAt }],
    };
  }

  const mistake: CountingEvent = { type: 'mistake', userId: message.authorId };

  // Counting twice in a row never resets, it's only removed
  if (check.result === 'wrong' && counting.resetOnFail) {
    // Before anything was counted there's no run to end
    const events: CountingEvent[] =
      state.lastNumber > 0 ? [mistake, { type: 'reset', number: state.lastNumber, userId: message.authorId, at: message.createdAt }] : [mistake];
    return { state: applyReset(state, message), outcome: 'reset', check, events };
  }

  return { state: applyChecked(state, message), outcome: 'invalid', check, events: [mistake] };
}

export interface ReplayResult {
  state: CountingState;
  /** How many messages counted a number. */
  counted: number;
  /** Messages that broke the rules without resetting the game, which should be deleted. */
  invalidIds: string[];
  /** The resets that happened, with the number that was reached and who sent the wrong number. */
  resets: { number: number; userId: string }[];
  /** Everything to record for the stats, in order. */
  events: CountingEvent[];
}

/**
 * Check messages in order with the same rules as live counting, for catching up on messages sent while the bot was offline.
 * @param messages The messages, oldest first.
 */
export function replayCounts(
  state: CountingState,
  counting: Pick<GuildCounting, 'allowMath' | 'resetOnFail'>,
  messages: (CountMessage & { isBot: boolean })[],
): ReplayResult {
  const result: ReplayResult = { state, counted: 0, invalidIds: [], resets: [], events: [] };

  for (const message of messages) {
    const processed = processCount(result.state, counting, message);
    result.state = processed.state;
    result.events.push(...processed.events);

    if (processed.outcome === 'valid') result.counted++;
    if (processed.outcome === 'invalid') result.invalidIds.push(message.id);
    for (const event of processed.events) {
      if (event.type === 'reset') result.resets.push({ number: event.number, userId: event.userId });
    }
  }

  return result;
}

/** The first milestone, after which they go 250, 500, 1000, 2500, 5000 and so on. */
const FIRST_MILESTONE = 100;

/** The milestones up to and including a number: 100, 250, 500, 1000, 2500, 5000, 10000 and so on. */
export function getMilestones(upTo: number): number[] {
  const milestones: number[] = [];
  for (let base = FIRST_MILESTONE; base <= upTo; base *= 10) {
    for (const milestone of [base, base * 2.5, base * 5]) {
      if (milestone <= upTo) milestones.push(milestone);
    }
  }
  return milestones;
}

/** Whether a number is a milestone, like 100, 250, 500 or 1000. */
export const isMilestone = (number: number) => getMilestones(number).at(-1) === number;

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
