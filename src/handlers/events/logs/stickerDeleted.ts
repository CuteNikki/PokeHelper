import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildStickerDelete,
  once: false,
  async execute(_client, sticker) {
    if (!sticker.guild) return;
    await logServerChange(sticker.guild, {
      event: 'emojis',
      kind: 'deleted',
      label: (t) => t('logs.labels.stickerDeleted'),
      subject: code(sticker.name),
      thumbnail: sticker.url,
      id: ['sticker', sticker.id],
      actions: [AuditLogEvent.StickerDelete],
      targetId: sticker.id,
    });
  },
});
