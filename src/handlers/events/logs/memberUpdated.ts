import { AuditLogEvent, bold, Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { whoDid } from 'utility/logs/audit';
import { oldNew } from 'utility/logs/changes';
import { avatarOf, reasonPart, roleSubject, userSubject, when } from 'utility/logs/format';
import { sendLog } from 'utility/logs/send';
import { code } from 'utility/text';

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
        about: 'user',
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
        about: 'user',
        subject,
        thumbnail,
        by: doer,
        // Blocks like the other changes: a bold heading, then a role on each line
        details: [
          added.length > 0 ? `${bold(t('logs.changes.added'))}\n${added.join('\n')}` : null,
          removed.length > 0 ? `${bold(t('logs.changes.removed'))}\n${removed.join('\n')}` : null,
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
        about: 'user',
        subject,
        thumbnail,
        // Like a profile's avatar: changed, with the new one as the picture, or removed
        details: [`${bold(t('logs.avatar'))} ${t(after.avatar ? 'logs.avatarChanged' : 'logs.avatarRemoved')}`],
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
        about: 'user',
        subject,
        thumbnail,
        by: doer,
        details: [timedOut ? `${bold(t('logs.until'))} ${when(isUntil)}` : null, reasonPart(doer, t)],
        ids,
      }));
    }
  },
});
