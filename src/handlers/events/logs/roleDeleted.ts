import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildRoleDelete,
  once: false,
  async execute(_client, role) {
    await logServerChange(role.guild, {
      event: 'roles',
      kind: 'deleted',
      label: (t) => t('logs.labels.roleDeleted'),
      // A mention of a deleted role shows as unknown, so the name says which it was
      subject: code(`@${role.name}`),
      id: ['role', role.id],
      actions: [AuditLogEvent.RoleDelete],
      targetId: role.id,
    });
  },
});
