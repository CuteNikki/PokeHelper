import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { guildChanges } from 'utility/logs/changes';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after, {
      event: 'server',
      kind: 'updated',
      title: (t) => t('logs.server.updated'),
      about: after.name,
      details: (t) => [guildChanges(before, after, t).join('\n') || null],
      ids: (t) => t('logs.ids.server', { server: after.id }),
      actions: [AuditLogEvent.GuildUpdate],
      targetId: after.id,
    });
  },
});
