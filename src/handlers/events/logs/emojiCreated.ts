import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildEmojiCreate,
  once: false,
  async execute(_client, emoji) {
    await logServerChange(emoji.guild, {
      event: 'emojis',
      kind: 'created',
      label: (t) => t('logs.labels.emojiCreated'),
      about: 'emoji',
      subject: `${emoji.toString()} ${code(`:${emoji.name}:`)}`,
      thumbnail: emoji.imageURL({ size: 128 }),
      id: ['emoji', emoji.id],
      actions: [AuditLogEvent.EmojiCreate],
      targetId: emoji.id,
    });
  },
});
