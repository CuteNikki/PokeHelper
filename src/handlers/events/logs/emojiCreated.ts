import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildEmojiCreate,
  once: false,
  async execute(_client, emoji) {
    await logServerChange(emoji.guild, {
      event: 'emojis',
      kind: 'created',
      title: (t) => t('logs.emojis.created'),
      about: `${emoji.toString()} :${emoji.name}:`,
      ids: (t) => t('logs.ids.emoji', { emoji: emoji.id }),
      actions: [AuditLogEvent.EmojiCreate],
      targetId: emoji.id,
    });
  },
});
