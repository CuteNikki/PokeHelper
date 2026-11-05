/**
 * A limit on how often someone can use the same button or select: a few times in a row is always fine, like paging through the
 * Pokédex or changing settings one after another, and only clicking faster than anyone reads is stopped.
 */
export interface BurstLimit {
  /** How many uses fit in the window. */
  uses: number;
  /** In milliseconds. */
  window: number;
}

export const DEFAULT_BURST: BurstLimit = { uses: 6, window: 5_000 };

/** When each key, like a button and a user, was used within its window. */
const recent = new Map<string, number[]>();
/** Past this many keys, the ones whose uses are all over are forgotten, so the map doesn't grow with everyone who ever clicked. */
const SWEEP_AT = 1_000;

/**
 * Count a use, unless the limit is reached.
 * @returns Null if it may go ahead, or the time in milliseconds when it can be used again.
 */
export function takeBurst(key: string, limit: BurstLimit = DEFAULT_BURST, now = Date.now()): number | null {
  if (recent.size > SWEEP_AT) {
    for (const [other, uses] of recent) if (uses.every((usedAt) => now - usedAt >= limit.window)) recent.delete(other);
  }

  const uses = (recent.get(key) ?? []).filter((usedAt) => now - usedAt < limit.window);
  if (uses.length >= limit.uses) {
    recent.set(key, uses);
    // Free again once the oldest use leaves the window
    return uses[0]! + limit.window;
  }
  uses.push(now);
  recent.set(key, uses);
  return null;
}

/** Forget every use, like between tests. */
export const resetBursts = () => recent.clear();
