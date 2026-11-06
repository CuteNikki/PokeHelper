import type { ClientEvents } from 'discord.js';
import { t } from 'i18next';

import type { ExtendedClient } from 'classes/base/client';
import type { Event } from 'classes/base/event';

import { getFilesFrom } from 'utility/files';
import { logger } from 'utility/logger';

/** Register the event handlers in src/handlers/events. */
export async function loadEvents(client: ExtendedClient) {
  // Remove the listeners from a previous load, so reloading doesn't handle every event twice.
  // Only the bot's own listeners are tracked, so discord.js's internal ones are left alone
  for (const { name, listener } of client.eventListeners) client.off(name, listener);
  client.eventListeners = [];

  const tableData: { file: string; name: string; valid: boolean }[] = [];
  const startTime = performance.now();

  const filePaths = await getFilesFrom('src/handlers/events');

  await Promise.all(
    filePaths.map(async (filePath) => {
      const event = ((await import(`${filePath}?update=${Date.now()}`)) as { default: unknown }).default;

      if (isValidEvent(event)) {
        // Errors thrown by the handler are logged with the event and file, instead of becoming unhandled rejections
        const listener = (...args: ClientEvents[typeof event.options.name]) => {
          Promise.resolve()
            .then(() => event.options.execute(client, ...args))
            .catch((error: unknown) => logger.error(error, t('system.event.error', { event: event.options.name, file: filePath })));
        };
        client[event.options.once ? 'once' : 'on'](event.options.name, listener);
        client.eventListeners.push({ name: event.options.name, listener: listener as (...args: unknown[]) => void });

        tableData.push({ file: filePath.split('/').slice(-2).join('/'), name: event.options.name, valid: true });
      } else {
        // So the files counted are only the ones loaded
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

/** Whether a file's default export is an event handler. */
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
