import type { ClientEvents } from 'discord.js';

import type { ExtendedClient } from 'classes/base/client';

/**
 * Represents an event in the Discord client.
 *
 * @template T - The type of the event name, which is a key of ClientEvents.
 */
export class Event<T extends keyof ClientEvents> {
  constructor(
    public options: {
      name: T;
      once?: boolean;
      execute: (client: ExtendedClient, ...args: ClientEvents[T]) => unknown;
    },
  ) {}
}
