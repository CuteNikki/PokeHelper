import type { Collection } from 'discord.js';

/** What a button or select handler says about the custom IDs it handles. */
interface Handler {
  options: { customId: string; includesCustomId?: boolean };
}

/**
 * The handler for exactly that custom ID, or else the longest prefix it starts with. Only the start counts, as a custom ID can carry
 * other IDs that contain a prefix, like `lb:` in a settings ID.
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
