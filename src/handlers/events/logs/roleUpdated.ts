import { AuditLogEvent, Events, roleMention } from 'discord.js';

import { Event } from 'classes/base/event';

import { roleChanges } from 'utility/logs/changes';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildRoleUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after.guild, {
      event: 'roles',
      kind: 'updated',
      title: (t) => t('logs.roles.updated'),
      about: `${roleMention(after.id)} (${after.name})`,
      details: (t) => [roleChanges(before, after, t).join('\n') || null],
      ids: (t) => t('logs.ids.role', { role: after.id }),
      actions: [AuditLogEvent.RoleUpdate],
      targetId: after.id,
    });
  },
});
