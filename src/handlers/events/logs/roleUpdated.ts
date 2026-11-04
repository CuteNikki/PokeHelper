import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { roleChanges } from 'utility/logs/changes';
import { roleSubject } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildRoleUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after.guild, {
      event: 'roles',
      kind: 'updated',
      label: (t) => t('logs.labels.roleUpdated'),
      subject: roleSubject(after.id, after.name),
      details: (t) => [roleChanges(before, after, t).join('\n\n') || null],
      id: ['role', after.id],
      actions: [AuditLogEvent.RoleUpdate],
      targetId: after.id,
    });
  },
});
