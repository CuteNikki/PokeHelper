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
  const filePaths = await getFilesFrom('src/events');

  // Use Promise.all to load all event files concurrently
  await Promise.all(
    filePaths.map(async (filePath) => {
      const event = (await import(`${filePath}?update=${Date.now()}`)).default;

      if (isValidEvent(event)) {
        // Register the event with the client
        // Use 'once' or 'on' based on the event options
        client[event.options.once ? 'once' : 'on'](event.options.name, (...args: ClientEvents[typeof event.options.name]) =>
          event.options.execute(client, ...args),
        );
      } else {
        // Remove the path from filePaths if the event is invalid to show the correct count of successfully loaded events
        filePaths.splice(filePaths.indexOf(filePath), 1);
        logger.warn(t('system.event.invalid', { file: filePath }));
      }
    }),
  );
}

/**
 * Checks if the provided object is a valid event.
 *
 * @param event - The object to check.
 * @returns True if the object is a valid event, false otherwise.
 */
function isValidEvent(event: Event<keyof ClientEvents>): event is Event<keyof ClientEvents> {
  return (
    typeof event === 'object' &&
    event !== null &&
    typeof event.options === 'object' &&
    event.options !== null &&
    'name' in event.options &&
    'execute' in event.options
  );
}
