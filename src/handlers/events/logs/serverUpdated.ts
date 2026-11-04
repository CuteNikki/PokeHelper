import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { guildChanges } from 'utility/logs/changes';
import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after, {
      event: 'server',
      kind: 'updated',
      label: (t) => t('logs.labels.serverUpdated'),
      subject: code(after.name),
      thumbnail: after.iconURL({ size: 128 }),
      details: (t) => [guildChanges(before, after, t).join('\n\n') || null],
      id: ['server', after.id],
      actions: [AuditLogEvent.GuildUpdate],
      targetId: after.id,
    });
  },
});
