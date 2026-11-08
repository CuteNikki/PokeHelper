import { prisma } from 'database/index';

import type { GiveawayRoleKind, GiveawayStatus, Prisma } from 'generated/prisma/client';
import { DiscordLimits } from 'utility/discordLimits';
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
export const MAX_HOST_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MIN_WINNERS = 1;
export const MAX_WINNERS = 25;
/** The most prizes by place a giveaway can have, and how long each one's name can be, so they all fit on the post. */
export const MAX_PLACE_PRIZES = 5;
export const MAX_PLACE_PRIZE_LENGTH = 50;
/** How long a giveaway runs at least and at most, in minutes. */
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 60 * 24 * 60;
/** How long winners can have to claim their prize at least and at most, in minutes. */
export const MIN_CLAIM_MINUTES = 5;
export const MAX_CLAIM_MINUTES = 30 * 24 * 60;
/** How long a draft is kept without being started. */
export const DRAFT_LIFETIME = DAY;

const withRoles = { roles: { orderBy: { roleId: 'asc' } }, prizes: { orderBy: { position: 'asc' } } } satisfies Prisma.GiveawayInclude;
/** A giveaway with its roles and prizes, which is how they're always loaded. */
export type Giveaway = Prisma.GiveawayGetPayload<{ include: typeof withRoles }>;

/** What a new draft starts with. */
export interface NewDraft {
  guildId: string;
  channelId: string;
  hostId: string;
  host: string | null;
  locale: string;
  prize: string;
  winnerCount: number;
  durationMinutes: number;
}

/** Add a draft, or null if the server already has the most drafts there can be. */
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

/** The fields of a giveaway that can be changed directly. */
export type GiveawayUpdate = Pick<
  Prisma.GiveawayUncheckedUpdateInput,
  | 'channelId'
  | 'host'
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

const CHANGEABLE: GiveawayStatus[] = ['draft', 'active'];

/** Change a draft or running giveaway. Returns false if it ended meanwhile. */
export const updateGiveaway = async (id: string, data: GiveawayUpdate) =>
  (await prisma.giveaway.updateMany({ where: { id, status: { in: CHANGEABLE } }, data })).count > 0;

/** Lock a draft or running giveaway until the transaction is done, so ending it waits. Returns whether it can still be changed. */
const lockChangeable = async (tx: Prisma.TransactionClient, id: string) =>
  (await tx.$queryRaw<unknown[]>`SELECT 1 FROM "Giveaway" WHERE id = ${id} AND status::text IN ('draft', 'active') FOR UPDATE`).length > 0;

/** Set the roles of one kind, replacing the ones before. A role can only be of one kind, so it's taken off the others. */
export const setGiveawayRoles = (giveawayId: string, kind: GiveawayRoleKind, roles: { roleId: string; bonus?: number }[]) =>
  prisma.$transaction(async (tx) => {
    if (!(await lockChangeable(tx, giveawayId))) return;
    await tx.giveawayRole.deleteMany({ where: { giveawayId, OR: [{ kind }, { roleId: { in: roles.map((role) => role.roleId) } }] } });
    await tx.giveawayRole.createMany({ data: roles.map((role) => ({ giveawayId, kind, roleId: role.roleId, bonus: role.bonus ?? 0 })) });
  });

/** A prize for some of the first places: its name, and how many winners get it. */
export interface PlacePrize {
  name: string;
  count: number;
}

/** Set the prizes by place, in order, replacing the ones before. None means every winner gets the giveaway's prize. */
export const setPlacePrizes = (giveawayId: string, prizes: PlacePrize[]) =>
  prisma.$transaction(async (tx) => {
    if (!(await lockChangeable(tx, giveawayId))) return;
    await tx.giveawayPrize.deleteMany({ where: { giveawayId } });
    await tx.giveawayPrize.createMany({ data: prizes.map((prize, position) => ({ giveawayId, position, name: prize.name, count: prize.count })) });
  });

/** Give a role bonus entries, or take it off the bonus roles with null. A role can only be of one kind, so it's taken off the others. */
export const setBonusRole = (giveawayId: string, roleId: string, bonus: number | null) =>
  prisma.$transaction(async (tx) => {
    if (!(await lockChangeable(tx, giveawayId))) return;
    if (bonus === null) await tx.giveawayRole.deleteMany({ where: { giveawayId, roleId, kind: 'bonus' } });
    else {
      await tx.giveawayRole.upsert({
        where: { giveawayId_roleId: { giveawayId, roleId } },
        update: { kind: 'bonus', bonus },
        create: { giveawayId, roleId, kind: 'bonus', bonus },
      });
    }
  });

/** Why a draft couldn't be started. */
export type StartRefusal = 'notDraft' | 'full';

/** Start a draft with the server's next number and its end time, or say why it couldn't. The post is sent afterwards. */
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

/** Someone's entry in a giveaway, or null if they didn't enter. */
export const getEntry = (giveawayId: string, userId: string) => prisma.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId, userId } } });

/** Enter someone into a running giveaway. Returns whether they were added, were in it already, like with a double click, or it ended. */
export const enterGiveaway = (giveawayId: string, userId: string, entries: number, now = new Date()) =>
  prisma.$transaction(async (tx) => {
    // Locked until the entry is saved, so ending it waits for it, and nobody can enter one that ended in the meantime
    const [giveaway] = await tx.$queryRaw<{ status: string; endsAt: Date | null }[]>`
      SELECT status::text AS status, "endsAt" FROM "Giveaway" WHERE id = ${giveawayId} FOR SHARE`;
    if (giveaway?.status !== 'active' || !giveaway.endsAt || giveaway.endsAt <= now) return 'ended';
    const { count } = await tx.giveawayEntry.createMany({ data: [{ giveawayId, userId, entries }], skipDuplicates: true });
    return count > 0 ? 'added' : 'already';
  });

/** Take someone out of a giveaway. Returns whether they were in it. */
export const leaveGiveaway = async (giveawayId: string, userId: string) => (await prisma.giveawayEntry.deleteMany({ where: { giveawayId, userId } })).count > 0;

/** How many people entered a giveaway. */
export const countParticipants = (giveawayId: string) => prisma.giveawayEntry.count({ where: { giveawayId } });

/** The winners of a giveaway, without the ones who were replaced, in the order they were drawn. */
export const getWinners = (giveawayId: string) => prisma.giveawayWinner.findMany({ where: { giveawayId, replacedAt: null }, orderBy: { drawnAt: 'asc' } });

/** How a giveaway's participants are listed: who joined first or last, or who has the most or fewest entries. */
export type ParticipantSort = 'joined' | 'newest' | 'most' | 'fewest';
export const PARTICIPANT_SORTS: ParticipantSort[] = ['joined', 'newest', 'most', 'fewest'];

/** Ties are broken by who joined first, and then by ID, so the order never changes between pages. */
const PARTICIPANT_ORDER: Record<ParticipantSort, Prisma.GiveawayEntryOrderByWithRelationInput[]> = {
  joined: [{ createdAt: 'asc' }, { userId: 'asc' }],
  newest: [{ createdAt: 'desc' }, { userId: 'desc' }],
  most: [{ entries: 'desc' }, { createdAt: 'asc' }, { userId: 'asc' }],
  fewest: [{ entries: 'asc' }, { createdAt: 'asc' }, { userId: 'asc' }],
};

/** A page of a giveaway's participants, how many there are, and how many entries they have together. */
export async function getParticipants(giveawayId: string, sort: ParticipantSort, skip: number, take: number) {
  const where = { giveawayId };
  const [participants, totals] = await Promise.all([
    prisma.giveawayEntry.findMany({ where, orderBy: PARTICIPANT_ORDER[sort], skip, take }),
    prisma.giveawayEntry.aggregate({ where, _count: { _all: true }, _sum: { entries: true } }),
  ]);
  return { participants, total: totals._count._all, entries: totals._sum.entries ?? 0 };
}

/** Where someone is in a giveaway's participants, counted from 1, or null if they didn't enter. */
export async function getParticipantPosition(giveawayId: string, userId: string, sort: ParticipantSort): Promise<number | null> {
  const entry = await getEntry(giveawayId, userId);
  if (!entry) return null;
  // Everyone who comes before them in the order, field by field, like in PARTICIPANT_ORDER
  const before = (field: 'createdAt' | 'userId' | 'entries', direction: 'asc' | 'desc') => ({ [field]: { [direction === 'asc' ? 'lt' : 'gt']: entry[field] } });
  const same = (field: 'createdAt' | 'userId' | 'entries') => ({ [field]: entry[field] });
  const order = PARTICIPANT_ORDER[sort].map((part) => Object.entries(part)[0] as ['createdAt' | 'userId' | 'entries', 'asc' | 'desc']);
  const OR = order.map(([field, direction], index) => ({ AND: [...order.slice(0, index).map(([earlier]) => same(earlier)), before(field, direction)] }));
  return (await prisma.giveawayEntry.count({ where: { giveawayId, OR } })) + 1;
}

/** Every winner of a giveaway, also the ones who were replaced, in the order they were drawn. */
export const getAllWinners = (giveawayId: string) => prisma.giveawayWinner.findMany({ where: { giveawayId }, orderBy: { drawnAt: 'asc' } });

/** Someone's entries in a server's running giveaways that have bonus roles, with those roles, to work their entries out again. */
export const getEntriesWithBonus = (guildId: string, userId: string) =>
  prisma.giveawayEntry.findMany({
    where: { userId, giveaway: { guildId, status: 'active', roles: { some: { kind: 'bonus' } } } },
    include: { giveaway: { select: { roles: { where: { kind: 'bonus' }, select: { roleId: true, bonus: true } } } } },
  });

/** Change someone's entries in a giveaway, like after their roles changed. */
export const setEntries = (giveawayId: string, userId: string, entries: number) =>
  prisma.giveawayEntry.updateMany({ where: { giveawayId, userId }, data: { entries } });

/** Running giveaways whose time is up, the ones that ended first first. */
export const getDueGiveaways = (now = new Date()) =>
  prisma.giveaway.findMany({ where: { status: 'active', endsAt: { lte: now } }, orderBy: { endsAt: 'asc' }, include: withRoles });

/** Everyone who entered a giveaway, with their entries. */
export const getAllEntries = (giveawayId: string) => prisma.giveawayEntry.findMany({ where: { giveawayId }, select: { userId: true, entries: true } });

/** The all-time XP of members on a server, by their ID, for the ones who have any. */
export async function getXpOf(guildId: string, userIds: string[]): Promise<Map<string, number>> {
  const levels = await prisma.level.findMany({ where: { guildId, userId: { in: userIds } }, select: { userId: true, xp: true } });
  return new Map(levels.map((level) => [level.userId, level.xp]));
}

/**
 * Of some people drawn, the ones still in a giveaway, in the same order. Their entries are locked until the transaction is done, so deleting
 * their data waits for it, and then takes them off the winners too. Someone who deleted their data meanwhile is left out, so their ID isn't
 * stored again.
 */
async function stillEntered(tx: Prisma.TransactionClient, giveawayId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await tx.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "GiveawayEntry" WHERE "giveawayId" = ${giveawayId} AND "userId" = ANY(${userIds}) FOR SHARE`;
  const entered = new Set(rows.map((row) => row.userId));
  return userIds.filter((userId) => entered.has(userId));
}

/** Someone drawn as a winner, with the prize by place they get, or null for the giveaway's prize. */
export interface NewWinner {
  userId: string;
  prize: string | null;
}

/**
 * End a running giveaway with its winners.
 * @param claimBy Until when winners can claim their prize, or null when they don't have to.
 * @returns The winners saved, without anyone who left meanwhile, or null if it wasn't running anymore.
 */
export const finishGiveaway = (id: string, drawn: NewWinner[], claimBy: Date | null, now = new Date()) =>
  prisma.$transaction(async (tx) => {
    const { count } = await tx.giveaway.updateMany({ where: { id, status: 'active' }, data: { status: 'ended', endedAt: now } });
    if (count === 0) return null;
    const entered = new Set(
      await stillEntered(
        tx,
        id,
        drawn.map((winner) => winner.userId),
      ),
    );
    const winners = drawn.filter((winner) => entered.has(winner.userId));
    // A millisecond apart, so the order they were drawn in stays
    await tx.giveawayWinner.createMany({
      data: winners.map((winner, index) => ({ giveawayId: id, ...winner, drawnAt: new Date(now.getTime() + index), claimBy })),
    });
    return winners;
  });

/** Claim a prize, for a winner who has to and is still in time. Returns whether it was claimed now. */
export const claimWin = async (giveawayId: string, userId: string, now = new Date()) =>
  (
    await prisma.giveawayWinner.updateMany({
      where: { giveawayId, userId, replacedAt: null, claimedAt: null, claimBy: { gt: now } },
      data: { claimedAt: now },
    })
  ).count > 0;

/**
 * Of some people, the ones who still won another giveaway of a server that gives a role, and keep the role for that one. A win they have
 * to claim counts once they claimed it, as only then they got the role.
 */
export async function getOtherRoleWinners(guildId: string, giveawayId: string, roleId: string, userIds: string[]): Promise<Set<string>> {
  const wins = await prisma.giveawayWinner.findMany({
    where: {
      userId: { in: userIds },
      replacedAt: null,
      OR: [{ claimBy: null }, { claimedAt: { not: null } }],
      giveaway: { guildId, id: { not: giveawayId }, status: 'ended', winnerRoleId: roleId },
    },
    select: { userId: true },
  });
  return new Set(wins.flatMap((win) => win.userId ?? []));
}

/** Someone's win in a giveaway, the newest if they were drawn again after being replaced, or null if they never won it. */
export const getWin = (giveawayId: string, userId: string) => prisma.giveawayWinner.findFirst({ where: { giveawayId, userId }, orderBy: { drawnAt: 'desc' } });

/** Winners who didn't claim their prize in time and haven't been replaced yet, in ended giveaways. */
export const getMissedClaims = (now = new Date()) =>
  prisma.giveawayWinner.findMany({
    // Not winners who deleted their data, who can't claim anymore but keep their win
    where: { claimBy: { lte: now }, claimedAt: null, replacedAt: null, userId: { not: null }, giveaway: { status: 'ended' } },
    select: { id: true, giveawayId: true, giveaway: { select: { guildId: true } } },
  });

/**
 * Replace winners with new ones, like ones who didn't claim in time, or in a reroll.
 * @param winnerIds The IDs of the winner rows, not user IDs.
 * @returns The new winners saved, without anyone who left meanwhile, or null if someone else replaced them all meanwhile.
 */
export const replaceWinners = (giveawayId: string, winnerIds: string[], newUserIds: string[], claimBy: Date | null, now = new Date()) =>
  prisma.$transaction(async (tx) => {
    const replaced = await tx.giveawayWinner.findMany({
      where: { giveawayId, id: { in: winnerIds }, replacedAt: null },
      orderBy: { drawnAt: 'asc' },
      select: { id: true, prize: true },
    });
    const { count } = await tx.giveawayWinner.updateMany({
      where: { id: { in: replaced.map((winner) => winner.id) }, replacedAt: null },
      data: { replacedAt: now },
    });
    if (count === 0) return null;
    // Each new winner gets the prize of the one they replace
    const drawn = newUserIds.slice(0, replaced.length).map((userId, index) => ({ userId, prize: replaced[index]!.prize }));
    const entered = new Set(
      await stillEntered(
        tx,
        giveawayId,
        drawn.map((winner) => winner.userId),
      ),
    );
    const winners = drawn.filter((winner) => entered.has(winner.userId));
    await tx.giveawayWinner.createMany({
      data: winners.map((winner, index) => ({ giveawayId, ...winner, drawnAt: new Date(now.getTime() + index), claimBy })),
    });
    return winners;
  });

/** Which giveaways a list shows: the ones running, or the ones that ended or were cancelled. */
export type GiveawayTab = 'active' | 'ended';
/** How many ended giveaways a list shows, the newest first, as many as fit in its select. */
export const ENDED_LIST_SIZE = DiscordLimits.selectOptions;

/** A server's giveaways of a list, with how many entered each. Running ones end soonest first, ended ones newest first. */
export const listGiveaways = (guildId: string, tab: GiveawayTab) =>
  prisma.giveaway.findMany({
    where: { guildId, status: tab === 'active' ? 'active' : { in: ['ended', 'cancelled'] } },
    orderBy: tab === 'active' ? { endsAt: 'asc' } : { endedAt: 'desc' },
    take: tab === 'active' ? MAX_ACTIVE_GIVEAWAYS : ENDED_LIST_SIZE,
    include: { ...withRoles, _count: { select: { entries: true } } },
  });

/** How many giveaways a server has running, and how many ended or were cancelled. */
export async function countGiveaways(guildId: string): Promise<Record<GiveawayTab, number>> {
  const groups = await prisma.giveaway.groupBy({ by: ['status'], where: { guildId, status: { not: 'draft' } }, _count: { _all: true } });
  const of = (status: string) => groups.find((group) => group.status === status)?._count._all ?? 0;
  return { active: of('active'), ended: of('ended') + of('cancelled') };
}

/** Cancel a running giveaway, so it ends without winners. Returns whether it was still running. */
export const cancelGiveaway = async (id: string, now = new Date()) =>
  (await prisma.giveaway.updateMany({ where: { id, status: 'active' }, data: { status: 'cancelled', endedAt: now } })).count > 0;

/**
 * Take a deleted role out of a server's giveaways that can still change: out of their rules and bonus roles, and as their ping or winner role.
 * @returns The running giveaways it was in, with whether it gave bonus entries or was required there.
 */
export const forgetDeletedGiveawayRole = (guildId: string, roleId: string) =>
  prisma.$transaction(async (tx) => {
    const changing = { guildId, status: { in: ['draft', 'active'] as const satisfies GiveawayStatus[] } };
    const roles = await tx.giveawayRole.findMany({ where: { roleId, giveaway: changing }, select: { giveawayId: true, kind: true } });
    await tx.giveawayRole.deleteMany({ where: { roleId, giveaway: changing } });
    const ping = await tx.giveaway.updateManyAndReturn({ where: { ...changing, pingRoleId: roleId }, data: { pingRoleId: null }, select: { id: true } });
    const winner = await tx.giveaway.updateManyAndReturn({ where: { ...changing, winnerRoleId: roleId }, data: { winnerRoleId: null }, select: { id: true } });
    const touched = new Set([...roles.map((role) => role.giveawayId), ...ping.map((g) => g.id), ...winner.map((g) => g.id)]);
    const active = await tx.giveaway.findMany({ where: { id: { in: [...touched] }, status: 'active' }, select: { id: true } });
    const ofKind = (kind: GiveawayRoleKind) => new Set(roles.filter((role) => role.kind === kind).map((role) => role.giveawayId));
    const [bonus, required] = [ofKind('bonus'), ofKind('required')];
    return active.map((giveaway) => ({ id: giveaway.id, hadBonus: bonus.has(giveaway.id), wasRequired: required.has(giveaway.id) }));
  });

/** Forget the posts of a server's giveaways that were in a deleted channel, which went with it. They go on, and still end and draw. */
export const forgetDeletedGiveawayChannel = (guildId: string, channelId: string) =>
  prisma.giveaway.updateMany({ where: { guildId, channelId, messageId: { not: null } }, data: { messageId: null } });

/** A giveaway by its ID alone, for places without a server, like a button in a DM. Null if it doesn't exist. */
export const getGiveawayById = (id: string) => prisma.giveaway.findUnique({ where: { id }, include: withRoles });

/** Let winners keep their prize without claiming it, like when they couldn't be told where to claim it. */
export const dropClaims = (giveawayId: string, userIds: string[]) =>
  prisma.giveawayWinner.updateMany({ where: { giveawayId, userId: { in: userIds }, replacedAt: null, claimedAt: null }, data: { claimBy: null } });

/** Give several people in a giveaway the same number of entries at once. */
export const setEntriesOf = (giveawayId: string, userIds: string[], entries: number) =>
  prisma.giveawayEntry.updateMany({ where: { giveawayId, userId: { in: userIds } }, data: { entries } });

/** The running giveaways someone entered, with their servers. */
export const getRunningEntriesOf = (userId: string) =>
  prisma.giveawayEntry.findMany({ where: { userId, giveaway: { status: 'active' } }, select: { giveawayId: true, giveaway: { select: { guildId: true } } } });
