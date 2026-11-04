import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { roleSubject } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildRoleCreate,
  once: false,
  async execute(_client, role) {
    await logServerChange(role.guild, {
      event: 'roles',
      kind: 'created',
      label: (t) => t('logs.labels.roleCreated'),
      subject: roleSubject(role.id, role.name),
      id: ['role', role.id],
      actions: [AuditLogEvent.RoleCreate],
      targetId: role.id,
    });
  },
});
