import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildRoleDelete,
  once: false,
  async execute(_client, role) {
    await logServerChange(role.guild, {
      event: 'roles',
      kind: 'deleted',
      title: (t) => t('logs.roles.deleted'),
      // A mention of a deleted role shows as unknown, so the name says which it was
      about: `@${role.name}`,
      ids: (t) => t('logs.ids.role', { role: role.id }),
      actions: [AuditLogEvent.RoleDelete],
      targetId: role.id,
    });
  },
});
