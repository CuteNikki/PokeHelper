import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { formatNumber } from 'utility/duration';
import { avatarOf, channelRef, when } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';
import { code } from 'utility/text';

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
        `**${t('logs.invites.uses')}** ${invite.maxUses ? formatNumber(invite.maxUses, t) : t('logs.invites.unlimited')}\n**${t('logs.invites.expires')}** ${invite.expiresAt ? when(invite.expiresAt) : t('logs.invites.never')}`,
      ],
      ids: { invite: invite.code },
    }));
  },
});
