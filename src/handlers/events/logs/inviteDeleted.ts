import { AuditLogEvent, channelMention, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { logServerChange } from 'utility/logs/server';

/** An invite deleted by someone. Invites that ran out or were used up aren't in the audit log, but are logged too, with no one named. */
export default new Event({
  name: Events.InviteDelete,
  once: false,
  async execute(client, invite) {
    const guild = invite.guild && client.guilds.cache.get(invite.guild.id);
    if (!guild) return;
    await logServerChange(guild, {
      event: 'invites',
      kind: 'deleted',
      title: (t) => t('logs.invites.deleted'),
      about: invite.url,
      details: (t) => [invite.channelId ? `**${t('logs.invites.channel')}** ${channelMention(invite.channelId)}` : null],
      ids: (t) => t('logs.ids.invite', { code: invite.code }),
      actions: [AuditLogEvent.InviteDelete],
      targetId: invite.code,
    });
  },
});
