import { prisma } from 'database/index';

import type { ReactionRoleMenu } from 'generated/prisma/client';

// Roles are listed in the order they were added, which is the order of their buttons
const withRoles = { roles: { orderBy: { createdAt: 'asc' } } } as const;

export type RoleMenu = NonNullable<Awaited<ReturnType<typeof getRoleMenu>>>;

export const getRoleMenu = async (id: string) => prisma.reactionRoleMenu.findUnique({ where: { id }, include: withRoles });

export const getRoleMenuByMessageId = async (messageId: string) => prisma.reactionRoleMenu.findFirst({ where: { messageId }, include: withRoles });

export const getRoleMenus = async (guildId: string) =>
  prisma.reactionRoleMenu.findMany({ where: { guildId }, include: withRoles, orderBy: { createdAt: 'asc' } });

export const countRoleMenus = async (guildId: string) => prisma.reactionRoleMenu.count({ where: { guildId } });

export const createRoleMenu = async (guildId: string, channelId: string, name: string) =>
  prisma.reactionRoleMenu.create({ data: { guildId, channelId, name }, include: withRoles });

export const updateRoleMenu = async (id: string, data: Partial<Omit<ReactionRoleMenu, 'id' | 'guildId'>>) =>
  prisma.reactionRoleMenu.update({ where: { id }, data, include: withRoles });

export const deleteRoleMenu = async (id: string) => prisma.reactionRoleMenu.delete({ where: { id } });

/** Set the emoji of a role in a menu, adding the role if it isn't in there yet, or remove the role with null. */
export async function setRoleMenuRole(menuId: string, roleId: string, emoji: string | null) {
  if (emoji === null) return prisma.reactionRole.deleteMany({ where: { menuId, roleId } });
  // In one step, so two quick saves can't add the role twice
  return prisma.reactionRole.upsert({ where: { menuId_roleId: { menuId, roleId } }, create: { menuId, roleId, emoji }, update: { emoji } });
}

/**
 * Take a deleted role out of every menu of a guild, from its roles and its required roles.
 * @returns The IDs of the menus that had the role.
 */
export async function removeRoleFromMenus(guildId: string, roleId: string): Promise<string[]> {
  const menus = await prisma.reactionRoleMenu.findMany({
    where: { guildId, OR: [{ roles: { some: { roleId } } }, { requiredRoleIds: { has: roleId } }] },
  });

  await prisma.$transaction([
    prisma.reactionRole.deleteMany({ where: { roleId, roleMenu: { guildId } } }),
    ...menus
      .filter((menu) => menu.requiredRoleIds.includes(roleId))
      .map((menu) => prisma.reactionRoleMenu.update({ where: { id: menu.id }, data: { requiredRoleIds: menu.requiredRoleIds.filter((id) => id !== roleId) } })),
  ]);

  return menus.map((menu) => menu.id);
}
