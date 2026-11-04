import { channelMention, Events, time, TimestampStyles } from 'discord.js';

import { Event } from 'classes/base/event';

import { who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** An invite made. The invite says who made it, so the audit log isn't needed. */
export default new Event({
  name: Events.InviteCreate,
  once: false,
  async execute(client, invite) {
    const guild = invite.guild && client.guilds.cache.get(invite.guild.id);
    // Invites made by the bot itself aren't anyone's doing
    if (!guild || invite.inviterId === client.user?.id) return;

    await sendLog(guild, 'invites', (t) => ({
      kind: 'created',
      title: t('logs.invites.created'),
      about: `${invite.url}${invite.inviter ? ` · ${t('logs.by', { user: who(invite.inviter) })}` : ''}`,
      details: [
        invite.channelId ? `**${t('logs.invites.channel')}** ${channelMention(invite.channelId)}` : null,
        `**${t('logs.invites.uses')}** ${invite.maxUses ? invite.maxUses.toLocaleString(t('locale')) : t('logs.invites.unlimited')}`,
        `**${t('logs.invites.expires')}** ${invite.expiresAt ? time(invite.expiresAt, TimestampStyles.RelativeTime) : t('logs.invites.never')}`,
      ],
      ids: t('logs.ids.invite', { code: invite.code }),
    }));
  },
});
