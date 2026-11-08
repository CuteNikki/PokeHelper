import type { Guild, GuildMember, PermissionsString } from 'discord.js';

/** Why the bot can't give a role to members. */
export type RoleProblem = 'everyone' | 'managed' | 'dangerous' | 'noManageRoles' | 'tooHigh';

/**
 * Permissions too powerful to hand out by a button, level or birthday, as anyone can end up with the role that way, so someone
 * who can change the settings could give themselves, or everyone, more power than they have.
 */
const DANGEROUS_PERMISSIONS: PermissionsString[] = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'ManageMessages',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'MentionEveryone',
];

/** Why the bot can't give a role to members, or null if it can (or it's not cached). */
export function getRoleProblem(guild: Guild, roleId: string): RoleProblem | null {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members?.me;
  if (!role || !me) return null;
  if (role.id === guild.id) return 'everyone';
  if (role.managed) return 'managed';
  // Checked whenever the role is given, so a role that gets such permissions later stops being handed out
  if (role.permissions.any(DANGEROUS_PERMISSIONS)) return 'dangerous';
  if (!me.permissions.has('ManageRoles')) return 'noManageRoles';
  if (role.position >= me.roles.highest.position) return 'tooHigh';
  return null;
}

/** Whether the bot can give a role to members right now: it exists and has no problem. */
export const canGiveRole = (guild: Guild, roleId: string) => guild.roles.cache.has(roleId) && getRoleProblem(guild, roleId) === null;

/** Whether a role is too high for a member to have the bot hand out: like Discord's rule, it must be below their highest, unless they're the owner. */
export function isRoleAboveMember(member: GuildMember, roleId: string): boolean {
  const role = member.guild.roles.cache.get(roleId);
  if (!role || member.id === member.guild.ownerId) return false;
  return role.position >= member.roles.highest.position;
}
