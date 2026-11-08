import { prisma } from 'database/index';

import type { GiveawayRoleKind, Prisma } from 'generated/prisma/client';
import { DAY, MINUTE } from 'utility/duration';

/** The most giveaways a server can have running at once. */
export const MAX_ACTIVE_GIVEAWAYS = 25;
/** The most drafts a server can have at once, so a forgotten draft or two never stops anyone from starting a new one. */
export const MAX_DRAFTS = 25;
/** The most roles a giveaway can ask for, keep out, and give bonus entries for, each. */
export const MAX_RULE_ROLES = 5;
/** The most entries one bonus role can give. */
export const MAX_BONUS = 10;
export const MAX_PRIZE_LENGTH = 256;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MIN_WINNERS = 1;
export const MAX_WINNERS = 50;
/** How long a giveaway runs at least and at most, in minutes. */
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 60 * 24 * 60;
/** How long a draft is kept without being started. */
export const DRAFT_LIFETIME = DAY;

const withRoles = { roles: { orderBy: { roleId: 'asc' } } } satisfies Prisma.GiveawayInclude;
/** A giveaway with its roles, which is how they're always loaded. */
export type Giveaway = Prisma.GiveawayGetPayload<{ include: typeof withRoles }>;

/** What a new draft starts with. Everything else starts empty or off. */
export interface NewDraft {
  guildId: string;
  channelId: string;
  hostId: string;
  locale: string;
  prize: string;
  winnerCount: number;
  durationMinutes: number;
}

/**
 * Add a draft, making sure the server is stored first.
 * @returns The draft, or null if the server already has the most drafts there can be.
 */
export const createDraft = (data: NewDraft) =>
  prisma.$transaction(async (tx) => {
    // One at a time per server, so two at once can't both pass the count and go over the limit
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`giveaways:${data.guildId}`}))`;
    if ((await tx.giveaway.count({ where: { guildId: data.guildId, status: 'draft' } })) >= MAX_DRAFTS) return null;
    await tx.guild.upsert({ where: { guildId: data.guildId }, update: {}, create: { guildId: data.guildId } });
    return tx.giveaway.create({ data, include: withRoles });
  });

/** A giveaway of a server, or null if it doesn't exist or belongs to another server. */
export const getGiveaway = (guildId: string, id: string) => prisma.giveaway.findFirst({ where: { id, guildId }, include: withRoles });

/** The giveaway a message is the post of, or null if it isn't one. */
export const getGiveawayByMessage = (messageId: string) => prisma.giveaway.findUnique({ where: { messageId }, include: withRoles });

/** The fields of a giveaway that can be changed directly, like its prize or rules. */
export type GiveawayUpdate = Pick<
  Prisma.GiveawayUncheckedUpdateInput,
  | 'channelId'
  | 'hostId'
  | 'prize'
  | 'description'
  | 'winnerCount'
  | 'durationMinutes'
  | 'endsAt'
  | 'requireAllRoles'
  | 'minLevel'
  | 'minMemberMinutes'
  | 'minAccountMinutes'
  | 'claimMinutes'
  | 'winnerRoleId'
  | 'pingRoleId'
  | 'dmWinners'
>;

/** Change a giveaway. Returns whether it was still there. */
export const updateGiveaway = async (id: string, data: GiveawayUpdate) => (await prisma.giveaway.updateMany({ where: { id }, data })).count > 0;

/**
 * Set the roles of one kind, replacing the ones before. A role can only be of one kind, so it's taken off the others.
 * @param roles The roles, with their bonus for bonus roles.
 */
export const setGiveawayRoles = (giveawayId: string, kind: GiveawayRoleKind, roles: { roleId: string; bonus?: number }[]) =>
  prisma.$transaction([
    prisma.giveawayRole.deleteMany({ where: { giveawayId, OR: [{ kind }, { roleId: { in: roles.map((role) => role.roleId) } }] } }),
    prisma.giveawayRole.createMany({ data: roles.map((role) => ({ giveawayId, kind, roleId: role.roleId, bonus: role.bonus ?? 0 })) }),
  ]);

/** Give a role bonus entries, or take it off the bonus roles with null. A role can only be of one kind, so it's taken off the others. */
export const setBonusRole = (giveawayId: string, roleId: string, bonus: number | null) =>
  bonus === null
    ? prisma.giveawayRole.deleteMany({ where: { giveawayId, roleId, kind: 'bonus' } })
    : prisma.giveawayRole.upsert({
        where: { giveawayId_roleId: { giveawayId, roleId } },
        update: { kind: 'bonus', bonus },
        create: { giveawayId, roleId, kind: 'bonus', bonus },
      });

/** Why a draft couldn't be started. */
export type StartRefusal = 'notDraft' | 'full';

/**
 * Start a draft: give it the server's next number and its end time. The post is sent afterwards, see {@link setGiveawayMessage}.
 * @returns The started giveaway, or why it couldn't be started.
 */
export const startGiveaway = (guildId: string, id: string, now = new Date()) =>
  prisma.$transaction(async (tx): Promise<Giveaway | StartRefusal> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`giveaways:${guildId}`}))`;
    const draft = await tx.giveaway.findFirst({ where: { id, guildId, status: 'draft' } });
    if (!draft) return 'notDraft';
    if ((await tx.giveaway.count({ where: { guildId, status: 'active' } })) >= MAX_ACTIVE_GIVEAWAYS) return 'full';
    const { giveawayCount } = await tx.guild.update({ where: { guildId }, data: { giveawayCount: { increment: 1 } }, select: { giveawayCount: true } });
    return tx.giveaway.update({
      where: { id },
      data: { status: 'active', number: giveawayCount, endsAt: new Date(now.getTime() + draft.durationMinutes * MINUTE) },
      include: withRoles,
    });
  });

/** Turn a started giveaway back into a draft, like when its post couldn't be sent. Its number isn't used again. */
export const unstartGiveaway = (id: string) =>
  prisma.giveaway.updateMany({ where: { id, status: 'active', messageId: null }, data: { status: 'draft', number: null, endsAt: null } });

/** Remember a giveaway's post, or that it's gone with null. */
export const setGiveawayMessage = (id: string, messageId: string | null) => prisma.giveaway.updateMany({ where: { id }, data: { messageId } });

/** Delete a giveaway or draft, with its entries and winners. Returns whether it was still there. */
export const deleteGiveaway = async (guildId: string, id: string) => (await prisma.giveaway.deleteMany({ where: { id, guildId } })).count > 0;

/** How many giveaways a server has running. */
export const countActiveGiveaways = (guildId: string) => prisma.giveaway.count({ where: { guildId, status: 'active' } });

/** Delete the drafts that weren't started in time. */
export const deleteOldDrafts = (now = new Date()) =>
  prisma.giveaway.deleteMany({ where: { status: 'draft', createdAt: { lt: new Date(now.getTime() - DRAFT_LIFETIME) } } });
