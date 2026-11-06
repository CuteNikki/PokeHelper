import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { channelSubject } from 'utility/logs/format';
import { oldNew } from 'utility/logs/changes';
import { logServerChange } from 'utility/logs/server';
import { code } from 'utility/text';

/** A thread renamed, archived, locked or opened again. Threads archiving on their own after a while aren't logged, nobody did that. */
export default new Event({
  name: Events.ThreadUpdate,
  once: false,
  async execute(_client, before, after) {
    const yesNo = (value: boolean | null) => (value ? 'state.yes' : 'state.no');
    await logServerChange(after.guild, {
      event: 'threads',
      kind: 'updated',
      label: (t) => t('logs.labels.threadUpdated'),
      about: 'thread',
      subject: channelSubject(after.id, after.name),
      details: (t) => [
        before.name !== after.name ? oldNew(t('logs.changes.name'), code(before.name), code(after.name), t) : null,
        before.locked !== after.locked ? oldNew(t('logs.threads.locked'), t(yesNo(before.locked)), t(yesNo(after.locked)), t) : null,
        before.archived !== after.archived ? oldNew(t('logs.threads.archived'), t(yesNo(before.archived)), t(yesNo(after.archived)), t) : null,
      ],
      id: ['channel', after.id],
      actions: [AuditLogEvent.ThreadUpdate],
      targetId: after.id,
      // Discord archives quiet threads on its own, which is only someone's doing when the audit log says so
      needsDoer: before.name === after.name && before.locked === after.locked,
    });
  },
});
