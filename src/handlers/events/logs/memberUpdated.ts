import { AuditLogEvent, Events, time, TimestampStyles } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { oldNew } from 'utility/logs/changes';
import { avatarOf, code, reasonPart, roleSubject, userSubject } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';

/** A member changed: their nickname, roles or server avatar, or a timeout given or taken away. Each is its own log. */
export default new Event({
  name: Events.GuildMemberUpdate,
  once: false,
  async execute(_client, before, after) {
    // Without the member from before, there's nothing to compare
    if (before.partial) return;
    const { guild } = after;
    const subject = userSubject(after.user);
    const thumbnail = avatarOf(after);
    const ids = { user: after.id };

    if (before.nickname !== after.nickname) {
      const doer = await whoDid(guild.id, AuditLogEvent.MemberUpdate, after.id);
      await sendLog(guild, 'memberNickname', (t) => ({
        kind: 'updated',
        label: t('logs.labels.memberNickname'),
        subject,
        thumbnail,
        // Changing your own nickname is no one else's doing
        by: doer && doer.id !== after.id ? doer : null,
        details: [
          oldNew(
            t('logs.changes.nickname'),
            before.nickname ? code(before.nickname) : `*${t('logs.changes.none')}*`,
            after.nickname ? code(after.nickname) : `*${t('logs.changes.none')}*`,
            t,
          ),
        ],
        ids,
      }));
    }

    const added = after.roles.cache.filter((role) => !before.roles.cache.has(role.id)).map((role) => roleSubject(role.id, role.name));
    const removed = before.roles.cache.filter((role) => !after.roles.cache.has(role.id)).map((role) => roleSubject(role.id, role.name));
    if (added.length > 0 || removed.length > 0) {
      const doer = await whoDid(guild.id, AuditLogEvent.MemberRoleUpdate, after.id);
      // Roles the bot gives and takes, like birthday or reward roles, are logged too, so it's clear where they came from
      await sendLog(guild, 'memberRoles', (t) => ({
        kind: removed.length === 0 ? 'created' : added.length === 0 ? 'deleted' : 'updated',
        label:
          removed.length === 0
            ? t('logs.labels.rolesAdded', { count: added.length })
            : added.length === 0
              ? t('logs.labels.rolesRemoved', { count: removed.length })
              : t('logs.labels.rolesChanged'),
        subject,
        thumbnail,
        by: doer,
        // Both at once are said with + and −, one of them alone only needs its label
        details: [
          added.length > 0 && removed.length > 0
            ? `${t('logs.changes.added')}: ${added.join(' ')}\n${t('logs.changes.removed')}: ${removed.join(' ')}`
            : [...added, ...removed].join(' '),
          reasonPart(doer, t),
        ],
        // The roles too, so their IDs can be copied with the member's and the moderator's
        ids: {
          ...ids,
          role: [...after.roles.cache.keys(), ...before.roles.cache.keys()].filter((id) => !before.roles.cache.has(id) || !after.roles.cache.has(id)),
        },
      }));
    }

    if (before.avatar !== after.avatar) {
      await sendLog(guild, 'memberProfile', (t) => ({
        kind: 'updated',
        label: t('logs.labels.serverAvatar'),
        subject,
        thumbnail,
        details: [after.avatar ? null : t('logs.avatarRemoved')],
        ids,
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
        label: t(timedOut ? 'logs.labels.timedOut' : 'logs.labels.timeoutRemoved'),
        subject,
        thumbnail,
        by: doer,
        details: [timedOut ? `**${t('logs.until')}** ${time(new Date(isUntil), TimestampStyles.LongDateTime)}` : null, reasonPart(doer, t)],
        ids,
      }));
    }
  },
});
