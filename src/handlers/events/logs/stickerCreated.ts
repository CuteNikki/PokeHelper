import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';
import { code } from 'utility/text';

export default new Event({
  name: Events.GuildStickerCreate,
  once: false,
  async execute(_client, sticker) {
    if (!sticker.guild) return;
    await logServerChange(sticker.guild, {
      event: 'emojis',
      kind: 'created',
      label: (t) => t('logs.labels.stickerCreated'),
      about: 'sticker',
      subject: code(sticker.name),
      thumbnail: sticker.url,
      id: ['sticker', sticker.id],
      actions: [AuditLogEvent.StickerCreate],
      targetId: sticker.id,
    });
  },
});
