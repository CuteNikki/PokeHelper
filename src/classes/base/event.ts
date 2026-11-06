import type { ClientEvents } from 'discord.js';

import type { ExtendedClient } from 'classes/base/client';

/** A handler for a Discord event. Several files can handle the same one. */
export class Event<T extends keyof ClientEvents> {
  constructor(
    public options: {
      name: T;
      once?: boolean;
      execute: (client: ExtendedClient, ...args: ClientEvents[T]) => unknown;
    },
  ) {}
}
