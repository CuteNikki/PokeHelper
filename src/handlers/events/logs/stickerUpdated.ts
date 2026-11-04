import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildStickerUpdate,
  once: false,
  async execute(_client, before, after) {
    if (!after.guild) return;
    await logServerChange(after.guild, {
      event: 'emojis',
      kind: 'updated',
      title: (t) => t('logs.emojis.stickerUpdated'),
      about: `[${after.name}](${after.url})`,
      details: (t) => [
        before.name !== after.name ? `**${t('logs.changes.name')}** ${before.name} → ${after.name}` : null,
        before.description !== after.description ? `**${t('logs.changes.description')}** ${before.description ?? '-'} → ${after.description ?? '-'}` : null,
      ],
      ids: (t) => t('logs.ids.sticker', { sticker: after.id }),
      actions: [AuditLogEvent.StickerUpdate],
      targetId: after.id,
    });
  },
});
