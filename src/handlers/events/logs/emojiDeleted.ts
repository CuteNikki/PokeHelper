import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildEmojiDelete,
  once: false,
  async execute(_client, emoji) {
    await logServerChange(emoji.guild, {
      event: 'emojis',
      kind: 'deleted',
      title: (t) => t('logs.emojis.deleted'),
      // A deleted emoji can't be shown anymore, so a link to its picture says which it was
      about: `[:${emoji.name}:](${emoji.imageURL()})`,
      ids: (t) => t('logs.ids.emoji', { emoji: emoji.id }),
      actions: [AuditLogEvent.EmojiDelete],
      targetId: emoji.id,
    });
  },
});
