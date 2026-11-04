import { AuditLogEvent, Events, time, TimestampStyles } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { roleListChanges } from 'utility/logs/changes';
import { byLine, reasonPart, who } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** A member changed: their nickname, roles or server avatar, or a timeout given or taken away. Each is its own log. */
export default new Event({
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(_client, before, after) {
    // Without the member from before, there's nothing to compare
    if (before.partial) return;
    const { guild } = after;

    if (before.nickname !== after.nickname) {
      const doer = await whoDid(guild.id, AuditLogEvent.MemberUpdate, after.id);
      await sendLog(guild, 'memberNickname', (t) => ({
        kind: 'updated',
        title: t('logs.memberNickname.title'),
        // Changing your own nickname is no one else's doing
        about: who(after.user) + (doer && doer.id !== after.id ? byLine(doer, t) : ''),
        details: [
          `**${t('logs.before')}** ${before.nickname ?? t('logs.changes.none')}`,
          `**${t('logs.after')}** ${after.nickname ?? t('logs.changes.none')}`,
        ],
        ids: t('logs.ids.user', { user: after.id }),
      }));
    }

    const roles = roleListChanges([...before.roles.cache.keys()], [...after.roles.cache.keys()]);
    if (roles) {
      const doer = await whoDid(guild.id, AuditLogEvent.MemberRoleUpdate, after.id);
      // Roles the bot gives and takes, like birthday or reward roles, are logged too, so it's clear where they came from
      await sendLog(guild, 'memberRoles', (t) => ({
        kind: 'updated',
        title: t('logs.memberRoles.title'),
        about: who(after.user) + byLine(doer, t),
        details: [roles],
        ids: t('logs.ids.user', { user: after.id }),
      }));
    }

    if (before.avatar !== after.avatar) {
      await sendLog(guild, 'memberProfile', (t) => ({
        kind: 'updated',
        title: t('logs.memberProfile.serverAvatar'),
        about: who(after.user),
        details: [after.avatar ? `[${t('logs.memberProfile.newAvatar')}](${after.displayAvatarURL({ size: 512 })})` : t('logs.memberProfile.avatarRemoved')],
        ids: t('logs.ids.user', { user: after.id }),
      }));
    }

    const wasUntil = before.communicationDisabledUntilTimestamp ?? 0;
    const isUntil = after.communicationDisabledUntilTimestamp ?? 0;
    const timedOut = isUntil > Date.now();
    // A timeout running out on its own isn't a change anyone made
    if (wasUntil !== isUntil && (timedOut || wasUntil > Date.now())) {
      const doer = await whoDid(guild.id, AuditLogEvent.MemberUpdate, after.id);
      await sendLog(guild, 'memberTimedOut', (t) => ({
        kind: timedOut ? 'deleted' : 'created',
        title: t(timedOut ? 'logs.memberTimedOut.title' : 'logs.memberTimedOut.removed'),
        about: who(after.user) + byLine(doer, t),
        details: [timedOut ? `**${t('logs.memberTimedOut.until')}** ${time(new Date(isUntil), TimestampStyles.LongDateTime)}` : null, reasonPart(doer, t)],
        ids: t('logs.ids.user', { user: after.id }),
      }));
    }
  },
});
