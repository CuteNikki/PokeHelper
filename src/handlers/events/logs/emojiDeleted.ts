import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildEmojiDelete,
  once: false,
  async execute(_client, emoji) {
    await logServerChange(emoji.guild, {
      event: 'emojis',
      kind: 'deleted',
      label: (t) => t('logs.labels.emojiDeleted'),
      // A deleted emoji can't be shown anymore, so a link to its picture says which it was
      about: 'emoji',
      subject: code(`:${emoji.name}:`),
      thumbnail: emoji.imageURL({ size: 128 }),
      id: ['emoji', emoji.id],
      actions: [AuditLogEvent.EmojiDelete],
      targetId: emoji.id,
    });
  },
});
