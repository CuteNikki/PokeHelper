import type { AuditLogEvent, GuildAuditLogsEntry } from 'discord.js';

/**
 * Who did something, for the logs. The events Discord sends say exactly what changed, but not who changed it: the audit log does,
 * a moment later. So the audit log entries of the last minute are kept, and a log waits a little for the one that matches it.
 */

/** How long entries are kept, how long a log waits for its entry, and how old an entry can be to still match. */
const KEEP = 60_000;
const WAIT = 2_000;
const MATCH = 10_000;

const recent = new Map<string, GuildAuditLogsEntry[]>();
const waiting = new Set<() => void>();

/** Keep an audit log entry for a minute, and wake whatever's waiting for one. */
export function rememberAuditEntry(guildId: string, entry: GuildAuditLogsEntry) {
  const entries = [...(recent.get(guildId) ?? []), entry].filter((kept) => Date.now() - kept.createdTimestamp < KEEP);
  recent.set(guildId, entries);
  for (const wake of waiting) wake();
}

/** Who did something, and why if they said. */
export interface Doer {
  id: string;
  reason: string | null;
}

/**
 * Who made a change, from its audit log entry: one of `actions`, about `targetId`, made in the last few seconds.
 * Waits a little for it to arrive.
 * @returns Who did it, or null if no entry came, like when the bot can't view the audit log.
 */
export function whoDid(guildId: string, actions: AuditLogEvent | AuditLogEvent[], targetId: string | null): Promise<Doer | null> {
  const types = new Set<number>(Array.isArray(actions) ? actions : [actions]);
  const find = () =>
    [...(recent.get(guildId) ?? [])]
      .reverse()
      .find(
        (entry) => types.has(entry.action) && (targetId === null || entry.targetId === targetId) && Date.now() - entry.createdTimestamp < MATCH,
      );
  const toDoer = (entry: GuildAuditLogsEntry | undefined): Doer | null => (entry?.executorId ? { id: entry.executorId, reason: entry.reason } : null);

  const found = find();
  if (found) return Promise.resolve(toDoer(found));

  return new Promise((resolve) => {
    const done = (entry?: GuildAuditLogsEntry) => {
      waiting.delete(check);
      clearTimeout(timer);
      resolve(toDoer(entry));
    };
    const check = () => {
      const entry = find();
      if (entry) done(entry);
    };
    const timer = setTimeout(() => done(), WAIT);
    waiting.add(check);
  });
}
