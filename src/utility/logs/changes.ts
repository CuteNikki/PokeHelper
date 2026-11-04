import { inlineCode, OverwriteType, PermissionsBitField, type Guild, type GuildBasedChannel, type PermissionsString, type Role } from 'discord.js';

import type { Translate } from 'utility/i18next';
import { channelRef, code, roleRef, userRef } from 'utility/logs/format';

/**
 * What changed about a channel, role or the server, as a block for each change with its old and new value, in the server's language.
 * Only what people set themselves is listed, not what Discord changes on its own, like a channel's position when another one moves.
 */

type Value = string | number | boolean | null | undefined;

/** A value as it's shown: text in code, yes or no, or none. */
function show(value: Value, t: Translate): string {
  if (value === null || value === undefined || value === '') return `*${t('logs.changes.none')}*`;
  if (typeof value === 'boolean') return t(value ? 'state.yes' : 'state.no');
  return inlineCode(String(value).replace(/`/g, "'"));
}

/**
 * A change as its own block: what it is, then the old and the new value on lines of their own, like
 * `**Name**`, `Old: test`, `New: testing`. Values are given already formatted.
 */
export const oldNew = (label: string, before: string, after: string, t: Translate) =>
  `**${label}**\n${t('logs.changes.old')}: ${before}\n${t('logs.changes.new')}: ${after}`;

/** A block for a value that changed, or null if it's the same. Mentions are shown as they are, everything else in code. */
function changed(label: string, before: Value, after: Value, t: Translate, mention?: (id: string) => string): string | null {
  if (before === after || ((before ?? '') === '' && (after ?? '') === '')) return null;
  const format = (value: Value) => (mention && typeof value === 'string' && value ? mention(value) : show(value, t));
  return oldNew(label, format(before), format(after), t);
}

/** Permissions under a bold heading, one on each line in the server's language, like the roles someone was given. */
const permissionList = (heading: string, permissions: PermissionsString[], t: Translate) =>
  [`**${heading}**`, ...permissions.map((permission) => t(`permission.${permission}`))].join('\n');

/**
 * The permissions given and taken between two sets, as a block for each way they changed, like `**Permissions added**` and the
 * permissions under it, or none if they're the same.
 */
function permissionChanges(before: bigint, after: bigint, t: Translate, headings: { added: string; removed: string }) {
  const added = new PermissionsBitField(after & ~before).toArray();
  const removed = new PermissionsBitField(before & ~after).toArray();
  return [added.length > 0 ? permissionList(headings.added, added, t) : null, removed.length > 0 ? permissionList(headings.removed, removed, t) : null].filter(
    (block): block is string => block !== null,
  );
}

/** What changed about who can do what in a channel: a block for each role or member whose permissions there changed. */
function overwriteChanges(before: GuildBasedChannel, after: GuildBasedChannel, t: Translate): string[] {
  if (!('permissionOverwrites' in before) || !('permissionOverwrites' in after)) return [];
  const old = before.permissionOverwrites.cache;
  const current = after.permissionOverwrites.cache;
  const blocks: string[] = [];
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    const was = old.get(id);
    const is = current.get(id);
    const who = (is ?? was)!.type === OverwriteType.Role ? (id === after.guild.id ? code('@everyone') : roleRef(after.guild, id)) : userRef(after.guild, id);
    blocks.push(
      ...permissionChanges(was?.allow.bitfield ?? 0n, is?.allow.bitfield ?? 0n, t, {
        added: t('logs.changes.nowAllowedFor', { who }),
        removed: t('logs.changes.noLongerAllowedFor', { who }),
      }),
      ...permissionChanges(was?.deny.bitfield ?? 0n, is?.deny.bitfield ?? 0n, t, {
        added: t('logs.changes.nowDeniedFor', { who }),
        removed: t('logs.changes.noLongerDeniedFor', { who }),
      }),
    );
  }
  return blocks;
}

/** What changed about a channel. */
export function channelChanges(before: GuildBasedChannel, after: GuildBasedChannel, t: Translate): string[] {
  const get = <K extends string>(channel: GuildBasedChannel, key: K) => (key in channel ? (channel as unknown as Record<K, Value>)[key] : undefined);
  const lines = [
    changed(t('logs.changes.name'), before.name, after.name, t),
    changed(t('logs.changes.topic'), get(before, 'topic'), get(after, 'topic'), t),
    changed(t('logs.changes.category'), before.parentId, after.parentId, t, (id) => channelRef(after.guild, id)),
    changed(t('logs.changes.nsfw'), get(before, 'nsfw'), get(after, 'nsfw'), t),
    changed(t('logs.changes.slowmode'), get(before, 'rateLimitPerUser'), get(after, 'rateLimitPerUser'), t),
    changed(t('logs.changes.bitrate'), get(before, 'bitrate'), get(after, 'bitrate'), t),
    changed(t('logs.changes.userLimit'), get(before, 'userLimit'), get(after, 'userLimit'), t),
  ];
  return [...lines.filter((line): line is string => line !== null), ...overwriteChanges(before, after, t)];
}

/** What changed about a role. */
export function roleChanges(before: Role, after: Role, t: Translate): string[] {
  const lines = [
    changed(t('logs.changes.name'), before.name, after.name, t),
    changed(t('logs.changes.color'), before.hexColor, after.hexColor, t),
    changed(t('logs.changes.hoist'), before.hoist, after.hoist, t),
    changed(t('logs.changes.mentionable'), before.mentionable, after.mentionable, t),
    changed(t('logs.changes.icon'), before.icon ?? before.unicodeEmoji, after.icon ?? after.unicodeEmoji, t),
    ...permissionChanges(before.permissions.bitfield, after.permissions.bitfield, t, {
      added: t('logs.changes.permissionsAdded'),
      removed: t('logs.changes.permissionsRemoved'),
    }),
  ];
  return lines.filter((line): line is string => line !== null);
}

/** What changed about the server's settings. */
export function guildChanges(before: Guild, after: Guild, t: Translate): string[] {
  const lines = [
    changed(t('logs.changes.name'), before.name, after.name, t),
    changed(t('logs.changes.description'), before.description, after.description, t),
    changed(t('logs.changes.icon'), before.icon, after.icon, t),
    changed(t('logs.changes.banner'), before.banner, after.banner, t),
    changed(t('logs.changes.owner'), before.ownerId, after.ownerId, t, (id) => userRef(after, id)),
    changed(t('logs.changes.verification'), before.verificationLevel, after.verificationLevel, t),
    changed(t('logs.changes.contentFilter'), before.explicitContentFilter, after.explicitContentFilter, t),
    changed(t('logs.changes.afkChannel'), before.afkChannelId, after.afkChannelId, t, (id) => channelRef(after, id)),
    changed(t('logs.changes.afkTimeout'), before.afkTimeout, after.afkTimeout, t),
    changed(t('logs.changes.systemChannel'), before.systemChannelId, after.systemChannelId, t, (id) => channelRef(after, id)),
    changed(t('logs.changes.rulesChannel'), before.rulesChannelId, after.rulesChannelId, t, (id) => channelRef(after, id)),
    changed(t('logs.changes.vanity'), before.vanityURLCode, after.vanityURLCode, t),
    changed(t('logs.changes.boostBar'), before.premiumProgressBarEnabled, after.premiumProgressBarEnabled, t),
  ];
  return lines.filter((line): line is string => line !== null);
}
