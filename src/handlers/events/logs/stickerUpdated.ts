import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { code } from 'utility/logs/format';
import { logServerChange } from 'utility/logs/server';

export default new Event({
  name: Events.GuildStickerUpdate,
  once: false,
  async execute(_client, before, after) {
    if (!after.guild) return;
    await logServerChange(after.guild, {
      event: 'emojis',
      kind: 'updated',
      label: (t) => t('logs.labels.stickerUpdated'),
      subject: code(after.name),
      thumbnail: after.url,
      details: (t) => [
        before.name !== after.name ? `**${t('logs.changes.name')}** ${code(before.name)} → ${code(after.name)}` : null,
        before.description !== after.description
          ? `**${t('logs.changes.description')}** ${before.description ? code(before.description) : t('logs.changes.none')} → ${after.description ? code(after.description) : t('logs.changes.none')}`
          : null,
      ],
      id: ['sticker', after.id],
      actions: [AuditLogEvent.StickerUpdate],
      targetId: after.id,
    });
  },
});
