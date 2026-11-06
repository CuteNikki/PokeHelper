import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { oldNew } from 'utility/logs/changes';
import { logServerChange } from 'utility/logs/server';
import { code } from 'utility/text';

export default new Event({
  name: Events.GuildEmojiUpdate,
  once: false,
  async execute(_client, before, after) {
    await logServerChange(after.guild, {
      event: 'emojis',
      kind: 'updated',
      label: (t) => t('logs.labels.emojiUpdated'),
      about: 'emoji',
      subject: `${after.toString()} ${code(`:${after.name}:`)}`,
      thumbnail: after.imageURL({ size: 128 }),
      details: (t) => [before.name !== after.name ? oldNew(t('logs.changes.name'), code(`:${before.name}:`), code(`:${after.name}:`), t) : null],
      id: ['emoji', after.id],
      actions: [AuditLogEvent.EmojiUpdate],
      targetId: after.id,
    });
  },
});
