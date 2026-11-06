import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from 'discord.js';

import { MINUTE, SECOND } from 'utility/duration';

/**
 * Who did something, for the logs. The events Discord sends say exactly what changed, but not who changed it: the audit log does,
 * a moment later. So the audit log entries of the last minute are kept, and a log waits a little for the one that matches it.
 */

/** How long entries are kept, how long a log waits for its entry, and how old an entry can be to still match. */
const KEEP = MINUTE;
const WAIT = 2 * SECOND;
const MATCH = 10 * SECOND;
/** How long Discord adds deletions to an entry instead of making a new one, as far as the bot looks. */
const MERGE_WINDOW = 15 * MINUTE;
/** How long a read of a server's audit log is used for, so a burst of deletions reads it once. */
const READ_FOR = 1.5 * SECOND;

const recent = new Map<string, GuildAuditLogsEntry[]>();
/** Entries that already said who did something, for changes that each have an entry of their own. */
const used = new WeakSet<GuildAuditLogsEntry>();
const waiting = new Set<() => void>();
/** How many deletions each message deletion entry was known to have, to notice the ones Discord added to it. */
const deleteCounts = new Map<string, { count: number; createdAt: number }>();
/** The latest read of each server's message deletions in the audit log, while it's fresh. */
const reads = new Map<string, { at: number; entries: Promise<GuildAuditLogsEntry[]> }>();

/** How many deletions a message deletion entry stands for. */
const countOf = (entry: GuildAuditLogsEntry) => (entry.extra as { count?: number } | null)?.count ?? 1;

/** Keep an audit log entry for a minute, and wake whatever's waiting for one. */
export function rememberAuditEntry(guildId: string, entry: GuildAuditLogsEntry) {
  const entries = [...(recent.get(guildId) ?? []), entry].filter((kept) => Date.now() - kept.createdTimestamp < KEEP);
  recent.set(guildId, entries);
  if (entry.action === AuditLogEvent.MessageDelete) deleteCounts.set(entry.id, { count: countOf(entry), createdAt: entry.createdTimestamp });
  for (const wake of waiting) wake();
}

/** Who did something, and why if they said. */
export interface Doer {
  id: string;
  reason: string | null;
}

/** The channel an entry is about, for deleted messages. */
const channelOf = (entry: GuildAuditLogsEntry) => (entry.extra as { channel?: { id: string } } | null)?.channel?.id;

/**
 * Who made a change, from its audit log entry: one of `actions`, about `targetId`, made in the last few seconds.
 * Waits a little for it to arrive.
 * @param options.channelId Only an entry about this channel, like for a deleted message.
 * @param options.once Each entry only counts for one change, like a deleted message, so someone deleting their own message right after
 * a moderator deleted one of theirs isn't taken for the moderator.
 * @returns Who did it, or null if no entry came, like when the bot can't view the audit log.
 */
export function whoDid(
  guildId: string,
  actions: AuditLogEvent | AuditLogEvent[],
  targetId: string | null,
  options: { channelId?: string; once?: boolean } = {},
): Promise<Doer | null> {
  const types = new Set<number>(Array.isArray(actions) ? actions : [actions]);
  const matches = (entry: GuildAuditLogsEntry) =>
    types.has(entry.action) &&
    (targetId === null || entry.targetId === targetId) &&
    (!options.channelId || channelOf(entry) === options.channelId) &&
    !(options.once && used.has(entry)) &&
    Date.now() - entry.createdTimestamp < MATCH;
  const find = () => [...(recent.get(guildId) ?? [])].reverse().find(matches);
  const toDoer = (entry: GuildAuditLogsEntry | undefined): Doer | null => {
    if (entry && options.once) used.add(entry);
    return entry?.executorId ? { id: entry.executorId, reason: entry.reason } : null;
  };

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

/** A server's recent message deletion entries, read at most once in a short while. Empty if the bot can't view the audit log. */
function readDeletions(guild: Guild): Promise<GuildAuditLogsEntry[]> {
  const read = reads.get(guild.id);
  if (read && Date.now() - read.at < READ_FOR) return read.entries;
  const entries = guild.members.me?.permissions.has('ViewAuditLog')
    ? guild
        .fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 25 })
        .then((logs) => [...logs.entries.values()] as GuildAuditLogsEntry[])
        .catch(() => [])
    : Promise.resolve([]);
  reads.set(guild.id, { at: Date.now(), entries });
  return entries;
}

/**
 * Who deleted someone's message, when it wasn't them. Discord makes an entry for the first deletion, and when the same person deletes
 * more of someone's messages in a channel soon after, only counts them up on that entry, without sending it again. So when no new entry
 * comes, the audit log is read to find one that was counted up.
 * @returns Who deleted it, or null if they deleted it themselves or it can't be told.
 */
export async function whoDeleted(guild: Guild, authorId: string, channelId: string): Promise<Doer | null> {
  const doer = await whoDid(guild.id, AuditLogEvent.MessageDelete, authorId, { channelId, once: true });
  if (doer) return doer;

  const now = Date.now();
  for (const [id, known] of deleteCounts) if (now - known.createdAt > MERGE_WINDOW) deleteCounts.delete(id);
  for (const entry of await readDeletions(guild)) {
    if (entry.targetId !== authorId || channelOf(entry) !== channelId || now - entry.createdTimestamp > MERGE_WINDOW) continue;
    const known = deleteCounts.get(entry.id);
    // An entry not seen before is only taken as counting up from now on, as what it counted before can't be told
    if (!known) {
      deleteCounts.set(entry.id, { count: countOf(entry), createdAt: entry.createdTimestamp });
      continue;
    }
    if (countOf(entry) > known.count) {
      // One deletion each, so two deletions counted up together go to one log each
      known.count++;
      return entry.executorId ? { id: entry.executorId, reason: entry.reason } : null;
    }
  }
  return null;
}
