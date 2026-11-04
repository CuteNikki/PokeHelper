import { AuditLogEvent, Events, roleMention } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildRoleCreate,
  once: false,
  async execute(_client, role) {
    await logServerChange(role.guild, {
      event: 'roles',
      kind: 'created',
      title: (t) => t('logs.roles.created'),
      about: `${roleMention(role.id)} (${role.name})`,
      ids: (t) => t('logs.ids.role', { role: role.id }),
      actions: [AuditLogEvent.RoleCreate],
      targetId: role.id,
    });
  },
});
