import { prisma } from '.';

import type { ReactionRoleMenu } from '../../generated/prisma/client';

export const getReactionRoleMenuConfiguration = async (id: string) =>
  prisma.reactionRoleMenu.findUnique({
    where: { id },
    include: { roles: true },
  });

export const getReactionRoleMenuConfigurationByMessageId = async (messageId: string) =>
  prisma.reactionRoleMenu.findFirst({
    where: { messageId },
    include: { roles: true },
  });

export const createReactionRoleMenuConfiguration = async (
  guildId: string,
  channelId: string,
  messageId: string,
  roles: { emoji: string; roleId: string }[],
  singleChoice = false,
  requiredRoleIds: string[] = [],
) =>
  prisma.reactionRoleMenu.create({
    data: { guildId, channelId, messageId, singleChoice, requiredRoleIds, roles: { create: roles } },
    include: { roles: true },
  });

export const updateReactionRoleMenuConfiguration = async (menuId: string, query: Partial<Omit<ReactionRoleMenu, 'id' | 'guildId'>>) =>
  prisma.reactionRoleMenu.update({
    where: { id: menuId },
    data: query,
    include: { roles: true },
  });

export const deleteReactionRoleMenuConfiguration = async (menuId: string) =>
  prisma.reactionRoleMenu.delete({
    where: { id: menuId },
    include: { roles: true },
  });

export const getAllReactionRoleMenusForGuild = async (guildId: string) =>
  prisma.reactionRoleMenu.findMany({
    where: { guildId },
    include: { roles: true },
  });
