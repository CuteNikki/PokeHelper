import type { AuditLogEvent, Guild } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { whoDid } from 'utility/logs/audit';
import type { IdKind } from 'utility/logs/copyIds';
import type { LogEvent } from 'utility/logs/events';
import { reasonPart } from 'utility/logs/format';
import { sendLog, shouldLog, type LogKind } from 'utility/logs/send';

/** A change to the server, like a channel or role created, deleted or changed. */
interface ServerChange {
  event: LogEvent;
  kind: LogKind;
  /** Like `📁 Channel created`, in the server's language. */
  label: (t: Translate) => string;
  /** Where it happened, after the label, like the channel of a thread. */
  where?: string | null;
  /** What changed, like a channel mention and its name. */
  subject: string;
  thumbnail?: string | null;
  details?: (t: Translate) => (string | null)[];
  /** The ID of what changed, for the Copy IDs button. */
  id: [IdKind, string];
  /** The audit log entries that say who did it. */
  actions: AuditLogEvent[];
  targetId: string;
  /** Only logged when the audit log says someone did it, for changes Discord also makes on its own, like archiving a quiet thread. */
  needsDoer?: boolean;
}

/**
 * Log a change to the server, with who made it from the audit log. Changes the bot made itself are left out,
 * as they're its own doing, like voice channels of their own being made and deleted all the time.
 */
export async function logServerChange(guild: Guild, change: ServerChange) {
  if (!(await shouldLog(guild, change.event))) return;
  const doer = await whoDid(guild.id, change.actions, change.targetId);
  if (doer?.id === guild.client.user.id || (change.needsDoer && !doer)) return;

  await sendLog(guild, change.event, (t) => {
    const details = change.details?.(t) ?? [];
    // An update where nothing worth logging changed, like only a channel's position
    if (change.kind === 'updated' && details.every((detail) => !detail)) return null;
    return {
      kind: change.kind,
      label: change.label(t),
      where: change.where,
      subject: change.subject,
      thumbnail: change.thumbnail,
      by: doer,
      details: [...details, reasonPart(doer, t)],
      ids: { [change.id[0]]: change.id[1] },
    };
  });
}
