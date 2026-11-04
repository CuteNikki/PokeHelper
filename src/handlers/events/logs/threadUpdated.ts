import { AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

/** A thread renamed, archived, locked or opened again. Threads archiving on their own after a while aren't logged, nobody did that. */
export default new Event({
  name: Events.ThreadUpdate,
  once: false,
  async execute(_client, before, after) {
    const yesNo = (value: boolean | null) => (value ? 'state.yes' : 'state.no');
    await logServerChange(after.guild, {
      event: 'threads',
      kind: 'updated',
      title: (t) => t('logs.threads.updated'),
      about: `${channelMention(after.id)} (${after.name})`,
      details: (t) => [
        before.name !== after.name ? `**${t('logs.changes.name')}** ${before.name} → ${after.name}` : null,
        before.locked !== after.locked ? `**${t('logs.threads.locked')}** ${t(yesNo(before.locked))} → ${t(yesNo(after.locked))}` : null,
        before.archived !== after.archived ? `**${t('logs.threads.archived')}** ${t(yesNo(before.archived))} → ${t(yesNo(after.archived))}` : null,
      ],
      ids: (t) => t('logs.ids.channel', { channel: after.id }),
      actions: [AuditLogEvent.ThreadUpdate],
      targetId: after.id,
      // Discord archives quiet threads on its own, which is only someone's doing when the audit log says so
      needsDoer: before.name === after.name && before.locked === after.locked,
    });
  },
});
