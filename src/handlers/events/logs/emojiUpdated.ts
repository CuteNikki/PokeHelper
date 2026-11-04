import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildEmojiUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after.guild, {
      event: 'emojis',
      kind: 'updated',
      title: (t) => t('logs.emojis.updated'),
      about: after.toString(),
      details: (t) => [before.name !== after.name ? `**${t('logs.changes.name')}** :${before.name}: → :${after.name}:` : null],
      ids: (t) => t('logs.ids.emoji', { emoji: after.id }),
      actions: [AuditLogEvent.EmojiUpdate],
      targetId: after.id,
    });
  },
});
