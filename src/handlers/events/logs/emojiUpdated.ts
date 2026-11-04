import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildEmojiUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after.guild, {
      event: 'emojis',
      kind: 'updated',
      label: (t) => t('logs.labels.emojiUpdated'),
      subject: `${after.toString()} ${code(`:${after.name}:`)}`,
      thumbnail: after.imageURL({ size: 128 }),
      details: (t) => [before.name !== after.name ? `**${t('logs.changes.name')}** ${code(`:${before.name}:`)} → ${code(`:${after.name}:`)}` : null],
      id: ['emoji', after.id],
      actions: [AuditLogEvent.EmojiUpdate],
      targetId: after.id,
    });
  },
});
