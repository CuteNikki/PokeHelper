/**
 * A cache that keeps the most recently used, up to a limit, and for a while if given. Waiting loads are kept too, so asking twice at once
 * loads once. Failures aren't kept, so the next try loads again.
 */
export class RecentCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>();

  /**
   * @param limit The most kept, so the cache can't grow forever.
   * @param keepFor How long each is kept, in milliseconds, for things that change, like avatars.
   */
  constructor(
    private readonly limit: number,
    private readonly keepFor = Infinity,
  ) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.entries.get(key);
    // Moved to the end, so the ones asked for least recently are first in line to go
    this.entries.delete(key);
    if (cached && cached.expiresAt > now) {
      this.entries.set(key, cached);
      return cached.value;
    }

    const value = load();
    this.entries.set(key, { value, expiresAt: now + this.keepFor });
    value.catch(() => this.entries.delete(key));
    for (const [oldest, entry] of this.entries) {
      if (this.entries.size <= this.limit && entry.expiresAt > now) break;
      this.entries.delete(oldest);
    }
    return value;
  }

  /** Forget one, so it's loaded again the next time, like after it was deleted. */
  forget(key: string) {
    this.entries.delete(key);
  }

  /** Forget all of them. */
  clear() {
    this.entries.clear();
  }
}
