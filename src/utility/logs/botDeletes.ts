import { MINUTE } from 'utility/duration';

/**
 * Messages the bot deletes itself as part of a feature, like wrong counts, which the logs leave out, as they'd flood the log of a busy
 * channel and say nothing a moderator needs to know.
 */
const deleting = new Map<string, number>();

/** How long a message is remembered, for a delete that fails and never arrives. */
const FORGET_AFTER = MINUTE;

/** Note that the bot is about to delete a message, so its delete isn't logged. */
export function markBotDelete(messageId: string) {
  const now = Date.now();
  for (const [id, at] of deleting) if (now - at > FORGET_AFTER) deleting.delete(id);
  deleting.set(messageId, now);
}

/** Whether the bot deleted a message itself, which is only answered once, for its delete. */
export const isBotDelete = (messageId: string) => deleting.delete(messageId);
