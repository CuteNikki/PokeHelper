import {
  channelMention,
  inlineCode,
  OverwriteType,
  PermissionsBitField,
  roleMention,
  userMention,
  type Guild,
  type GuildBasedChannel,
  type PermissionsString,
  type Role,
} from 'discord.js';

import type { Translate } from 'utility/i18next';

/**
 * What changed about a channel, role or the server, as lines like `**Name** old → new`, in the server's language.
 * Only what people set themselves is listed, not what Discord changes on its own, like a channel's position when another one moves.
 */

type Value = string | number | boolean | null | undefined;

/** A value as it's shown: text in code, yes or no, or none. */
function show(value: Value, t: Translate): string {
  if (value === null || value === undefined || value === '') return t('logs.changes.none');
  if (typeof value === 'boolean') return t(value ? 'state.yes' : 'state.no');
  return inlineCode(String(value).replace(/`/g, "'"));
}

/** A line for a value that changed, or null if it's the same. Mentions are shown as they are, everything else in code. */
function changed(label: string, before: Value, after: Value, t: Translate, mention?: (id: string) => string): string | null {
  if (before === after || ((before ?? '') === '' && (after ?? '') === '')) return null;
  const format = (value: Value) => (mention && typeof value === 'string' && value ? mention(value) : show(value, t));
  return `**${label}** ${format(before)} → ${format(after)}`;
}

/** Permissions by their names in the server's language. */
const permissionNames = (permissions: PermissionsString[], t: Translate) => permissions.map((permission) => t(`permission.${permission}`)).join(', ');

/** The permissions given and taken between two sets, like `+ Kick Members · − Ban Members`. */
function permissionChanges(before: bigint, after: bigint, t: Translate): string | null {
  const added = new PermissionsBitField(after & ~before).toArray();
  const removed = new PermissionsBitField(before & ~after).toArray();
  const parts = [added.length > 0 ? `+ ${permissionNames(added, t)}` : null, removed.length > 0 ? `− ${permissionNames(removed, t)}` : null];
  return parts.filter(Boolean).join(' · ') || null;
}

/** What changed about who can do what in a channel: each role or member whose permissions there were added, removed or changed. */
function overwriteChanges(before: GuildBasedChannel, after: GuildBasedChannel, t: Translate): string[] {
  if (!('permissionOverwrites' in before) || !('permissionOverwrites' in after)) return [];
  const old = before.permissionOverwrites.cache;
  const current = after.permissionOverwrites.cache;
  const lines: string[] = [];
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    const was = old.get(id);
    const is = current.get(id);
    const who = (is ?? was)!.type === OverwriteType.Role ? (id === after.guild.id ? '@everyone' : roleMention(id)) : userMention(id);
    const allowed = permissionChanges(was?.allow.bitfield ?? 0n, is?.allow.bitfield ?? 0n, t);
    const denied = permissionChanges(was?.deny.bitfield ?? 0n, is?.deny.bitfield ?? 0n, t);
    if (!allowed && !denied) continue;
    const parts = [allowed ? t('logs.changes.allowed', { permissions: allowed }) : null, denied ? t('logs.changes.denied', { permissions: denied }) : null];
    lines.push(`**${t('logs.changes.permissionsFor', { who })}** ${parts.filter(Boolean).join(' · ')}`);
  }
  return lines;
}

/** What changed about a channel. */
export function channelChanges(before: GuildBasedChannel, after: GuildBasedChannel, t: Translate): string[] {
  const get = <K extends string>(channel: GuildBasedChannel, key: K) => (key in channel ? (channel as unknown as Record<K, Value>)[key] : undefined);
  const lines = [
    changed(t('logs.changes.name'), before.name, after.name, t),
    changed(t('logs.changes.topic'), get(before, 'topic'), get(after, 'topic'), t),
    changed(t('logs.changes.category'), before.parentId, after.parentId, t, channelMention),
    changed(t('logs.changes.nsfw'), get(before, 'nsfw'), get(after, 'nsfw'), t),
    changed(t('logs.changes.slowmode'), get(before, 'rateLimitPerUser'), get(after, 'rateLimitPerUser'), t),
    changed(t('logs.changes.bitrate'), get(before, 'bitrate'), get(after, 'bitrate'), t),
    changed(t('logs.changes.userLimit'), get(before, 'userLimit'), get(after, 'userLimit'), t),
  ];
  return [...lines.filter((line): line is string => line !== null), ...overwriteChanges(before, after, t)];
}

/** What changed about a role. */
export function roleChanges(before: Role, after: Role, t: Translate): string[] {
  const permissions = permissionChanges(before.permissions.bitfield, after.permissions.bitfield, t);
  const lines = [
    changed(t('logs.changes.name'), before.name, after.name, t),
    changed(t('logs.changes.color'), before.hexColor, after.hexColor, t),
    changed(t('logs.changes.hoist'), before.hoist, after.hoist, t),
    changed(t('logs.changes.mentionable'), before.mentionable, after.mentionable, t),
    changed(t('logs.changes.icon'), before.icon ?? before.unicodeEmoji, after.icon ?? after.unicodeEmoji, t),
    permissions ? `**${t('logs.changes.permissions')}** ${permissions}` : null,
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
    changed(t('logs.changes.owner'), before.ownerId, after.ownerId, t, userMention),
    changed(t('logs.changes.verification'), before.verificationLevel, after.verificationLevel, t),
    changed(t('logs.changes.contentFilter'), before.explicitContentFilter, after.explicitContentFilter, t),
    changed(t('logs.changes.afkChannel'), before.afkChannelId, after.afkChannelId, t, channelMention),
    changed(t('logs.changes.afkTimeout'), before.afkTimeout, after.afkTimeout, t),
    changed(t('logs.changes.systemChannel'), before.systemChannelId, after.systemChannelId, t, channelMention),
    changed(t('logs.changes.rulesChannel'), before.rulesChannelId, after.rulesChannelId, t, channelMention),
    changed(t('logs.changes.vanity'), before.vanityURLCode, after.vanityURLCode, t),
    changed(t('logs.changes.boostBar'), before.premiumProgressBarEnabled, after.premiumProgressBarEnabled, t),
  ];
  return lines.filter((line): line is string => line !== null);
}

/** The roles given and taken, like `+ @Role · − @Other`. */
export function roleListChanges(before: string[], after: string[]): string | null {
  const added = after.filter((id) => !before.includes(id)).map(roleMention);
  const removed = before.filter((id) => !after.includes(id)).map(roleMention);
  const parts = [added.length > 0 ? `+ ${added.join(', ')}` : null, removed.length > 0 ? `− ${removed.join(', ')}` : null];
  return parts.filter(Boolean).join(' · ') || null;
}
