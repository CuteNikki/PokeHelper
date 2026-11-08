import type { Client } from 'discord.js';

import { clearGuildsLeft, deleteGuildsLeftBefore, markOtherGuildsLeft } from 'database/guild';

import { DAY } from 'utility/duration';
import { logger } from 'utility/logger';
import { logFailure } from 'utility/response';

/** How long a guild's data is kept after the bot was removed, in case it's added back. */
const KEEP_DATA_AFTER_LEAVING = 30 * DAY;

/** Catch up on removals and re-adds while offline. Guilds unavailable in an outage are still cached, so they don't count as left. */
async function reconcileGuilds(client: Client<true>) {
  const present = [...client.guilds.cache.keys()];
  // An empty cache means the guilds haven't loaded, not that the bot was removed from all of them
  if (present.length === 0) return;

  const now = new Date();
  const [left, back] = await Promise.all([markOtherGuildsLeft(present, now), clearGuildsLeft(present)]);
  if (left.count > 0 || back.count > 0) logger.info(`Guilds changed while offline: ${left.count} left, ${back.count} added back`);
}

async function deleteLeftGuilds() {
  const { count } = await deleteGuildsLeftBefore(new Date(Date.now() - KEEP_DATA_AFTER_LEAVING));
  if (count > 0) logger.info(`Deleted the data of ${count} guilds the bot left more than 30 days ago`);
}

/** Catch up on guilds left while offline, then delete the data of guilds left long enough ago, now and once a day. */
export async function startGuildCleanup(client: Client<true>) {
  // Set up first, so a failure right at startup, like the database not being ready yet, doesn't stop it for good
  setInterval(() => void deleteLeftGuilds().catch(logFailure('Failed to delete the data of guilds the bot left')), DAY);
  await reconcileGuilds(client).catch(logFailure('Failed to catch up on guilds joined or left while offline'));
  await deleteLeftGuilds().catch(logFailure('Failed to delete the data of guilds the bot left'));
}
