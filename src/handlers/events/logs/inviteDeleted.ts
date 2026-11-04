import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { channelRef, code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

/** An invite deleted by someone. Invites that ran out or were used up aren't in the audit log, but are logged too, with no one named. */
export default new Event({
  name: Events.InviteDelete,
  once: false,
  async execute(client, invite) {
    const guild = invite.guild && client.guilds.cache.get(invite.guild.id);
    if (!guild) return;
    await logServerChange(guild, {
      event: 'invites',
      kind: 'deleted',
      label: (t) => t('logs.labels.inviteDeleted'),
      subject: code(invite.code),
      where: invite.channelId ? channelRef(guild, invite.channelId) : null,
      id: ['invite', invite.code],
      actions: [AuditLogEvent.InviteDelete],
      targetId: invite.code,
    });
  },
});
