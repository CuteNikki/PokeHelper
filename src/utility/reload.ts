import i18next from 'i18next';

import type { ExtendedClient } from 'classes/base/client';

import { loadButtons } from 'loading/buttons';
import { loadCommands } from 'loading/commands';
import { loadEvents } from 'loading/events';
import { loadSelectMenus } from 'loading/selects';

export const RELOAD_TARGETS = ['commands', 'buttons', 'selects', 'events', 'locales'] as const;
export type ReloadTarget = (typeof RELOAD_TARGETS)[number];

export interface ReloadResult {
  target: ReloadTarget;
  /** How many were loaded, or null for the locales. */
  count: number | null;
  duration: number;
}

/**
 * Reload parts of the bot without restarting or disconnecting from the gateway.
 *
 * The files in src/commands, src/buttons, src/selects and src/events are imported again, but what they import
 * (utility, database, settings and so on) stays as it was loaded at startup, so changes there still need a restart.
 * The locales are read again from disk, which updates all the bot's text.
 * @param client The client to reload into.
 * @param targets What to reload.
 */
export async function reload(client: ExtendedClient, targets: readonly ReloadTarget[]): Promise<ReloadResult[]> {
  const results: ReloadResult[] = [];

  for (const target of targets) {
    switch (target) {
      case 'commands': {
        const { count, duration } = await loadCommands(client);
        results.push({ target, count, duration });
        break;
      }
      case 'buttons': {
        const { count, duration } = await loadButtons(client);
        results.push({ target, count, duration });
        break;
      }
      case 'selects': {
        const { count, duration } = await loadSelectMenus(client);
        results.push({ target, count, duration });
        break;
      }
      case 'events': {
        const { count, duration } = await loadEvents(client);
        results.push({ target, count, duration });
        break;
      }
      case 'locales': {
        const start = performance.now();
        await i18next.reloadResources();
        results.push({ target, count: null, duration: performance.now() - start });
        break;
      }
    }
  }

  return results;
}
