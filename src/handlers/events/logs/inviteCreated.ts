import { Events, time, TimestampStyles } from 'discord.js';

import { Event } from 'classes/base/event';

import { avatarOf, channelRef, code } from 'utility/logs/format';
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
      label: t('logs.labels.inviteCreated'),
      where: invite.channelId ? channelRef(guild, invite.channelId) : null,
      about: 'invite',
      subject: code(invite.code),
      thumbnail: avatarOf(invite.inviter),
      by: invite.inviterId ? { id: invite.inviterId, reason: null } : null,
      details: [
        `**${t('logs.invites.uses')}** ${invite.maxUses ? invite.maxUses.toLocaleString(t('locale')) : t('logs.invites.unlimited')}\n**${t('logs.invites.expires')}** ${invite.expiresAt ? time(invite.expiresAt, TimestampStyles.RelativeTime) : t('logs.invites.never')}`,
      ],
      ids: { invite: invite.code },
    }));
  },
});
