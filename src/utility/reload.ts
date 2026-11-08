import { stat } from 'node:fs/promises';

import { Glob } from 'bun';
import i18next from 'i18next';

import type { ExtendedClient } from 'classes/base/client';

import { loadButtons } from 'loading/buttons';
import { loadCommands } from 'loading/commands';
import { loadEvents } from 'loading/events';
import { loadSelectMenus } from 'loading/selects';

import { clearVocabulary } from 'utility/reminders/words';

export const RELOAD_TARGETS = ['commands', 'buttons', 'selects', 'events', 'locales'] as const;
export type ReloadTarget = (typeof RELOAD_TARGETS)[number];

export interface ReloadResult {
  target: ReloadTarget;
  /** How many were loaded, or null for the locales. */
  count: number | null;
  duration: number;
}

/**
 * Reload parts of the bot without restarting. Files in src/handlers are imported again, but what they import (utility, database,
 * settings...) stays as loaded at startup, so changes there still need a restart. Locales are read again from disk.
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
        // The words times are written with are read again the next time they're needed
        clearVocabulary();
        results.push({ target, count: null, duration: performance.now() - start });
        break;
      }
    }
  }

  return results;
}

/** The folders whose files are imported again when reloading. Text is reloaded too, so locales count as well. */
const RELOADABLE_FOLDERS = ['src/handlers/', 'src/locales/'];

/** Source files changed since start that a reload doesn't pick up, so a restart is needed. */
export async function changedSinceStart(): Promise<string[]> {
  const startedAt = performance.timeOrigin;
  const changed: string[] = [];
  for await (const path of new Glob('src/**/*.ts').scan('.')) {
    // Windows paths use backslashes
    const file = path.replaceAll('\\', '/');
    if (RELOADABLE_FOLDERS.some((folder) => file.startsWith(folder))) continue;
    if ((await stat(file)).mtimeMs > startedAt) changed.push(file);
  }
  return changed.sort();
}
