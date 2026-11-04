import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildStickerCreate,
  once: false,
  async execute(_client, sticker) {
    if (!sticker.guild) return;
    await logServerChange(sticker.guild, {
      event: 'emojis',
      kind: 'created',
      title: (t) => t('logs.emojis.stickerCreated'),
      about: `[${sticker.name}](${sticker.url})`,
      ids: (t) => t('logs.ids.sticker', { sticker: sticker.id }),
      actions: [AuditLogEvent.StickerCreate],
      targetId: sticker.id,
    });
  },
});
