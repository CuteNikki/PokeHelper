import type { Guild } from 'discord.js';

/** Why the bot can't give a role to members. */
export type RoleProblem = 'everyone' | 'managed' | 'noManageRoles' | 'tooHigh';

/**
 * Why the bot can't give a role to members, or null if it can.
 * Unknown when the bot's member or the role isn't cached, in which case null is returned.
 */
export function getRoleProblem(guild: Guild, roleId: string): RoleProblem | null {
  const role = guild.roles.cache.get(roleId);
  const me = guild.members?.me;
  if (!role || !me) return null;
  if (role.id === guild.id) return 'everyone';
  if (role.managed) return 'managed';
  if (!me.permissions.has('ManageRoles')) return 'noManageRoles';
  if (role.position >= me.roles.highest.position) return 'tooHigh';
  return null;
}

/** Whether the bot can give a role to members right now: it exists and has no problem. */
export const canGiveRole = (guild: Guild, roleId: string) => guild.roles.cache.has(roleId) && getRoleProblem(guild, roleId) === null;
