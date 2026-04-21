import type { ClientEvents } from 'discord.js';
import { t } from 'i18next';

import type { ExtendedClient } from 'classes/base/client';
import type { Event } from 'classes/base/event';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/**
 * Loads and registers events for the client.
 *
 * @param client - The ExtendedClient instance to load commands into.
 */
export async function loadEvents(client: ExtendedClient) {
  const tableData: { file: string; name: string; valid: boolean }[] = [];
  const startTime = performance.now();

  const filePaths = await getFilesFrom('src/events');

  // Use Promise.all to load all event files concurrently
  await Promise.all(
    filePaths.map(async (filePath) => {
      const event = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;

      if (isValidEvent(event)) {
        // Register the event with the client
        // Use 'once' or 'on' based on the event options
        client[event.options.once ? 'once' : 'on'](event.options.name, (...args: ClientEvents[typeof event.options.name]) =>
          event.options.execute(client, ...args),
        );

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), name: event.options.name, valid: true });
      } else {
        // Remove the path from filePaths if the event is invalid to show the correct count of successfully loaded events
        filePaths.splice(filePaths.indexOf(filePath), 1);
        logger.warn(t('system.event.invalid', { file: filePath }));

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), name: '?', valid: false });
      }
    }),
  );

  const endTime = performance.now();
  const duration = endTime - startTime;

  return { files: filePaths, tableData, duration, count: filePaths.length };
}

/**
 * Checks if the provided object is a valid event.
 *
 * @param event - The object to check.
 * @returns True if the object is a valid event, false otherwise.
 */
function isValidEvent(event: unknown): event is Event<keyof ClientEvents> {
  return (
    typeof event === 'object' &&
    event !== null &&
    typeof (event as Event<keyof ClientEvents>).options === 'object' &&
    (event as Event<keyof ClientEvents>).options !== null &&
    'name' in (event as Event<keyof ClientEvents>).options &&
    'execute' in (event as Event<keyof ClientEvents>).options
  );
}
