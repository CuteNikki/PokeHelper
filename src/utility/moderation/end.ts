import type { ModCase } from 'generated/prisma/client';
import { DAY } from 'utility/duration';
import { MAX_BAN_DAYS, MAX_TIMEOUT_DAYS } from 'utility/moderation/run';
import { parseDuration, parseWhen } from 'utility/reminders/time';

/** Words that make a ban one for good, in the languages the bot speaks. */
const NEVER = new Set(['never', 'forever', 'permanent', 'permanently', 'nie', 'niemals', 'für immer', 'dauerhaft']);

/** Words that end a timeout or ban right away. */
const NOW = new Set(['0', 'now', 'jetzt', 'sofort']);
/** What {@link parseNewEnd} gives for a timeout or ban to end right away. */
export const END_NOW = 'now';

/** Why a new end can't be used: it isn't one, it's in the past, it's too far ahead, or it's "never" for a timeout. */
export type EndError = 'invalid' | 'past' | 'tooLong' | 'neverTimeout';

/** Whether a case's end can still be changed: a timeout or ban that's still on. */
export const canChangeEnd = (modCase: Pick<ModCase, 'type' | 'endedAt' | 'expiresAt'>, now = new Date()) =>
  !modCase.endedAt &&
  ((modCase.type === 'timeout' && modCase.expiresAt !== null && modCase.expiresAt > now) ||
    (modCase.type === 'ban' && (modCase.expiresAt === null || modCase.expiresAt > now)));

/**
 * When a running timeout or ban ends after it was changed, from what was typed: a duration from now, like `3d`, the end moved by
 * a duration, like `+1d` or `-2h`, a date, like `24.12. 18:00` in the timezone given, `0` or `now` to end it right away, or for bans
 * `never`, to make it one for good.
 * @param current When it ends now, or null for a ban for good, whose end a `+` or `-` counts from now.
 * @returns The new end, null for a ban for good, {@link END_NOW} to end it right away, or why it can't be used.
 */
export function parseNewEnd(
  input: string,
  type: 'timeout' | 'ban',
  current: Date | null,
  timezone: string,
  now = new Date(),
): Date | null | typeof END_NOW | EndError {
  const text = input.trim().toLowerCase();
  if (NOW.has(text)) return END_NOW;
  if (NEVER.has(text)) return type === 'ban' ? null : 'neverTimeout';

  let end: Date;
  const moved = /^([+-])\s*(.+)$/.exec(text);
  if (moved) {
    // How long the duration is, counted from the start of time, so it can be added or taken away
    const offset = parseDuration(moved[2]!, new Date(0));
    if (!offset) return 'invalid';
    const base = (current ?? now).getTime();
    end = new Date(moved[1] === '+' ? base + offset.getTime() : base - offset.getTime());
  } else {
    const parsed = parseWhen(text, now, timezone);
    if (parsed === 'invalid') return 'invalid';
    if (parsed === 'past') return 'past';
    if (parsed === 'tooFar') return 'tooLong';
    end = parsed;
  }

  if (end.getTime() <= now.getTime()) return 'past';
  const maxDays = type === 'timeout' ? MAX_TIMEOUT_DAYS : MAX_BAN_DAYS;
  return end.getTime() - now.getTime() > maxDays * DAY ? 'tooLong' : end;
}
