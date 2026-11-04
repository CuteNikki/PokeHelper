import { AuditLogEvent, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { oldNew } from 'utility/logs/changes';
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
      about: 'sticker',
      subject: code(after.name),
      thumbnail: after.url,
      details: (t) => [
        before.name !== after.name ? oldNew(t('logs.changes.name'), code(before.name), code(after.name), t) : null,
        before.description !== after.description
          ? oldNew(
              t('logs.changes.description'),
              before.description ? code(before.description) : `*${t('logs.changes.none')}*`,
              after.description ? code(after.description) : `*${t('logs.changes.none')}*`,
              t,
            )
          : null,
      ],
      id: ['sticker', after.id],
      actions: [AuditLogEvent.StickerUpdate],
      targetId: after.id,
    });
  },
});
