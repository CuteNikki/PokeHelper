import type { Collection } from 'discord.js';

/** What a button or select handler says about the custom IDs it handles. */
interface Handler {
  options: { customId: string; includesCustomId?: boolean };
}

/**
 * The handler of a custom ID: the one for exactly that ID, or else the one whose prefix it starts with, the longest if several do.
 * A prefix anywhere else doesn't count, as a custom ID can carry other IDs that happen to contain one, like `lb:` in a settings ID.
 */
export function findHandler<T extends Handler>(handlers: Collection<string, T>, customId: string): T | undefined {
  const exact = handlers.get(customId);
  if (exact) return exact;
  let found: T | undefined;
  for (const handler of handlers.values()) {
    const prefix = handler.options.customId;
    if (handler.options.includesCustomId && customId.startsWith(prefix) && prefix.length > (found?.options.customId.length ?? -1)) found = handler;
  }
  return found;
}
