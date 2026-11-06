import type { DexPage } from 'utility/pokedex/pages';

/**
 * The pages each message went through before the one it shows, oldest first, so Back can go further than one page. Kept while the bot
 * runs, as a custom ID only has room for one page: after a restart, Back on older messages goes back one page and no further.
 */
const MAX_MESSAGES = 1000;
/** The most pages kept for a message, more than anyone clicks back through. */
const MAX_DEPTH = 20;
const trails = new Map<string, DexPage[]>();

/** The pages a message went through before the one it shows, oldest first. */
export const trailOf = (messageId: string): DexPage[] => trails.get(messageId) ?? [];

/** Keep the pages a message went through, the newest last, so the oldest is the first to go. */
export function setTrail(messageId: string, trail: DexPage[]): void {
  trails.delete(messageId);
  if (trail.length === 0) return;
  trails.set(messageId, trail.slice(-MAX_DEPTH));
  if (trails.size > MAX_MESSAGES) trails.delete(trails.keys().next().value ?? '');
}

/** How a page is opened: on from the one shown, back to the one before it, or as the same page shown another way, like another game. */
export type PageMove = 'forward' | 'back' | 'stay';

/**
 * Where a message's trail goes when a page is opened, and the page its Back button leads to.
 * @param from The page it was opened from, for going forward, or the page Back leads to, for staying.
 */
export function moveTrail(trail: DexPage[], move: PageMove, from: DexPage | null): { trail: DexPage[]; back: DexPage | null } {
  if (move === 'forward') {
    const next = from ? [...trail, from] : trail;
    return { trail: next, back: from };
  }
  if (move === 'back') {
    // The page gone back to was the last one, so the one before it is where Back goes next
    const next = trail.slice(0, -1);
    return { trail: next, back: next.at(-1) ?? null };
  }
  return { trail, back: trail.at(-1) ?? from };
}
