import {
  type CategoryChannel,
  ChannelType,
  type Guild,
  type GuildMember,
  type OverwriteData,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  type PermissionsString,
  type RateLimitData,
  RateLimitError,
  userMention,
  type VoiceChannel,
} from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import {
  createTempVoiceChannel,
  deleteTempVoiceChannel,
  getOwnedTempVoiceChannels,
  getTempVoiceChannel,
  getTempVoiceCreator,
  getTempVoiceCreatorByChannel,
  getTempVoiceSettings,
  saveTempVoiceSettings,
  updateTempVoiceChannel,
  type TempVoiceChannel,
  type TempVoiceCreator,
} from 'database/tempVoice';

import { SECOND } from 'utility/duration';
import { guildTranslate } from 'utility/i18next';
import type { Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { KeyedQueue } from 'utility/queue';
import { missingBotPermissions } from 'utility/settings';
import { announce, postPanel, refreshPanel } from 'utility/tempVoice/panel';

/**
 * Temporary voice channels: joining a join-to-create channel gives you a voice channel of your own, deleted once everyone has left.
 * The database says which channels are temporary, who owns each, and who it's open to. The channel's permissions are always
 * worked out from that and the category, never read back, so what the panel shows and what Discord does can't drift apart.
 * Owners get no permissions to manage the channel themselves: everything goes through the bot, which checks who's asking.
 */

export type TempChannel = { channel: VoiceChannel; record: TempVoiceChannel };

/** Who's let in even while it's locked or hidden, who's kept out, who helps the owner, and whether it's locked or hidden. */
export type Access = Pick<TempVoiceChannel, 'locked' | 'hidden' | 'allowed' | 'blocked' | 'moderators'>;

/** The most moderators a channel can have. */
export const MAX_MODERATORS = 10;

/** How long an owner can be gone, like a dropped connection or a quick hop elsewhere, before their channel goes to someone still there. */
const OWNER_GRACE = 30 * SECOND;
/** How long between channels for one person, so hopping in and out of a join channel can't flood the server with channels. */
const CREATE_COOLDOWN = 10 * SECOND;
/** The longest a channel's name can be. */
const MAX_NAME_LENGTH = 100;

/** What the bot needs where the channels are made: making them, setting who can join, moving people in, and posting the panel. */
export const TEMP_VOICE_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'Connect', 'ManageChannels', 'ManageRoles', 'MoveMembers', 'SendMessages'];

/** Permissions given and taken by locking (Connect) and hiding (ViewChannel). */
const CONNECT = PermissionFlagsBits.Connect;
const VIEW = PermissionFlagsBits.ViewChannel;
/** What the owner, and anyone let in, needs to be in the channel even while it's locked or hidden. */
const MEMBER =
  VIEW | CONNECT | PermissionFlagsBits.Speak | PermissionFlagsBits.Stream | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory;
/** What the bot needs on every channel, as a member overwrite so no role overwrite it changes can lock it out of its own channel. */
const BOT =
  VIEW |
  CONNECT |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory;
/** Roles with any of these are staff: never locked or hidden out, and able to change anyone's channel. */
const STAFF = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ModerateMembers;

/** Everything about temporary channels happens one at a time per channel, and per member for making one. */
const queue = new KeyedQueue();

/** A channel's name, from what its owner calls it and the join channel's prefix. */
export function channelName(prefix: string, label: string) {
  return `${prefix}${label}`.slice(0, MAX_NAME_LENGTH);
}

/** What a channel's owner calls it: its name without the prefix, also taken off if they typed it themselves. */
export function channelLabel(prefix: string, name: string) {
  let label = name.trim();
  while (prefix && label.startsWith(prefix)) label = label.slice(prefix.length).trim();
  return label;
}

/** The longest name an owner can give, after the prefix. */
export const maxLabelLength = (prefix: string) => MAX_NAME_LENGTH - prefix.length;

/** The temporary channel a channel ID is, if it's one and still there. */
export async function findTempChannel(guild: Guild, channelId: string | null | undefined): Promise<TempChannel | null> {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  if (channel?.type !== ChannelType.GuildVoice) return null;
  const record = await getTempVoiceChannel(channelId);
  return record ? { channel, record } : null;
}

/** People in a channel, leaving out bots. */
export function people(channel: VoiceChannel) {
  return channel.members.filter((member) => !member.user.bot);
}

/** Whether someone is staff: always let through locks and hides, never kept out, and able to change anyone's channel. */
export function isStaff(member: GuildMember) {
  return member.permissions.any(STAFF);
}

/** Whether someone may change everything about a channel: its owner, or staff. */
export function canChange(member: GuildMember, temp: TempChannel) {
  return member.id === temp.record.ownerId || isStaff(member);
}

/** Whether someone may let people in, keep them out, kick them and set the limit: the owner, staff, or one of its moderators. */
export function canModerate(member: GuildMember, temp: TempChannel) {
  return canChange(member, temp) || temp.record.moderators.includes(member.id);
}

/** Whether a change only needs a moderator: who's let in or kept out, and the limit. Anything else needs the owner. */
const isModeratorChange = (change: Change) => Object.keys(change).every((key) => key === 'allowed' || key === 'blocked' || key === 'userLimit');

/** Where a join channel's channels go: its own category, or the join channel's. */
export function creatorCategory(guild: Guild, creator: TempVoiceCreator): CategoryChannel | null {
  const id = creator.categoryId ?? guild.channels.cache.get(creator.channelId)?.parentId;
  const category = id ? guild.channels.cache.get(id) : null;
  return category?.type === ChannelType.GuildCategory ? category : null;
}

/** The permissions the bot is missing to make channels for a join channel, in its category or on the server. */
export function missingCreatorPermissions(guild: Guild, creator: TempVoiceCreator): PermissionsString[] {
  const category = creatorCategory(guild, creator);
  if (category) return missingBotPermissions(guild, category.id, TEMP_VOICE_PERMISSIONS);
  const me = guild.members.me;
  return me ? TEMP_VOICE_PERMISSIONS.filter((permission) => !me.permissions.has(permission)) : TEMP_VOICE_PERMISSIONS;
}

/**
 * A channel's permission overwrites: the category's, so it's open to whoever the category is, then locked or hidden by denying
 * @everyone and each role the category names (a role allowing it would win over @everyone), except staff roles, which are let through
 * instead. Then the bot, the owner, and whoever's let in or kept out, as members, which win over roles.
 *
 * Only permissions the bot has itself are set, as Discord refuses the rest, like a category giving a permission the bot doesn't have.
 */
function overwrites(guild: Guild, category: CategoryChannel | null, ownerId: string, access: Access): OverwriteData[] {
  const me = guild.members.me;
  const settable = me?.permissions.has(PermissionFlagsBits.Administrator) ? PermissionsBitField.All : (me?.permissions.bitfield ?? 0n);
  const list = new Map<string, { id: string; type: OverwriteType; allow: bigint; deny: bigint }>();
  const set = (id: string, type: OverwriteType, allow: bigint, deny: bigint) => {
    const current = list.get(id) ?? { id, type, allow: 0n, deny: 0n };
    list.set(id, { id, type, allow: ((current.allow & ~deny) | allow) & settable, deny: ((current.deny & ~allow) | deny) & settable });
  };

  for (const overwrite of category?.permissionOverwrites.cache.values() ?? [])
    set(overwrite.id, overwrite.type, overwrite.allow.bitfield, overwrite.deny.bitfield);

  const closed = (access.locked ? CONNECT : 0n) | (access.hidden ? VIEW : 0n);
  if (closed) {
    set(guild.roles.everyone.id, OverwriteType.Role, 0n, closed);
    const staff = new Set(guild.roles.cache.filter((role) => role.permissions.any(STAFF)).keys());
    for (const overwrite of [...list.values()]) {
      if (overwrite.type === OverwriteType.Role && overwrite.id !== guild.roles.everyone.id && !staff.has(overwrite.id))
        set(overwrite.id, OverwriteType.Role, 0n, closed);
    }
    for (const id of staff) set(id, OverwriteType.Role, closed, 0n);
  }

  set(guild.client.user.id, OverwriteType.Member, BOT, 0n);
  for (const id of [...access.allowed, ...access.moderators]) set(id, OverwriteType.Member, VIEW | CONNECT, 0n);
  for (const id of access.blocked) set(id, OverwriteType.Member, 0n, VIEW | CONNECT);
  set(ownerId, OverwriteType.Member, MEMBER, 0n);
  return [...list.values()];
}

/** Put a channel's permissions in line with who owns it and its access. Done before they're saved, so the record only says what Discord took. */
async function applyAccess(channel: VoiceChannel, record: Access & { ownerId: string }) {
  await channel.permissionOverwrites.set(overwrites(channel.guild, channel.parent, record.ownerId, record), 'Temporary voice channel access changed');
}

/** Only IDs of people on the server: Discord refuses overwrites for anyone else. */
async function onServer(guild: Guild, ids: string[]) {
  const found = await Promise.all(
    ids.map((id) =>
      guild.members
        .fetch(id)
        .then(() => id)
        .catch(() => null),
    ),
  );
  return found.filter((id): id is string => id !== null);
}

const lastCreated = new Map<string, number>();

/**
 * Make a channel for someone who joined a join channel, set up the way they left their last one on the server, and move them into it.
 * Someone who already has one goes back to it instead.
 */
export function createTempChannel(member: GuildMember, creator: TempVoiceCreator): Promise<void> {
  return queue.run(`member:${member.guild.id}:${member.id}`, async () => {
    const { guild } = member;
    if (member.voice.channelId !== creator.channelId) return;
    // Turned off, for the server or this join channel, joining it does nothing. Channels already made keep working
    if (!creator.enabled || !(await getFeatureSwitches(guild.id)).tempVoiceEnabled) return;

    for (const own of await getOwnedTempVoiceChannels(guild.id, member.id)) {
      const channel = guild.channels.cache.get(own.channelId);
      if (channel?.type === ChannelType.GuildVoice) {
        await member.voice.setChannel(channel, 'Back to their temporary voice channel');
        return;
      }
    }

    const key = `${guild.id}:${member.id}`;
    const wait = (lastCreated.get(key) ?? 0) + CREATE_COOLDOWN - Date.now();
    if (wait > 0) {
      // Still there once the cooldown's over, they get it then. From the join channel as it is by then, as it may have been turned off or deleted
      const retry = async () => {
        const current = await getTempVoiceCreator(creator.id);
        if (current) await createTempChannel(member, current);
      };
      setTimeout(() => void retry().catch((error: unknown) => logger.error(error, 'Failed to create a temporary voice channel')), wait);
      return;
    }

    const missing = missingCreatorPermissions(guild, creator);
    if (missing.length > 0) {
      logger.warn(`Can't create temporary voice channels in guild ${guild.id}, missing ${missing.join(', ')}`);
      return;
    }
    lastCreated.set(key, Date.now());
    // Forget cooldowns that are over, so the map doesn't grow with everyone who ever made one
    for (const [other, at] of lastCreated) if (at + CREATE_COOLDOWN < Date.now()) lastCreated.delete(other);

    const settings = await getTempVoiceSettings(guild.id, member.id);
    const access: Access = {
      locked: settings?.locked ?? false,
      hidden: settings?.hidden ?? false,
      allowed: await onServer(guild, settings?.allowed ?? []),
      blocked: await onServer(guild, settings?.blocked ?? []),
      moderators: await onServer(guild, settings?.moderators ?? []),
    };
    const category = creatorCategory(guild, creator);
    const channel = await guild.channels.create({
      name: channelName(creator.namePrefix, settings?.name ?? member.displayName),
      type: ChannelType.GuildVoice,
      parent: category?.id ?? null,
      userLimit: settings?.userLimit ?? 0,
      permissionOverwrites: overwrites(guild, category, member.id, access),
      reason: `Temporary voice channel for ${member.user.tag}`,
    });
    const record = await createTempVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      creatorId: creator.id,
      ownerId: member.id,
      namePrefix: creator.namePrefix,
      ...access,
    }).catch(async (error: unknown) => {
      // Not saved, like when the join channel was deleted meanwhile, so it goes again instead of staying without the bot knowing about it
      await channel.delete('Its temporary voice channel could not be saved').catch(() => null);
      throw error;
    });

    try {
      // They may have left while it was being made
      if (member.voice.channelId !== creator.channelId) throw new Error('Left before their channel was ready');
      await member.voice.setChannel(channel, 'Into their new temporary voice channel');
    } catch (error) {
      logger.debug(error, 'Deleting a temporary voice channel nobody got into');
      await deleteTempChannel({ channel, record });
      return;
    }
    await postPanel({ channel, record });
  });
}

/** The join channel someone joined, if it's one. */
export const findCreator = (channelId: string) => getTempVoiceCreatorByChannel(channelId);

const ownerAway = new Map<string, ReturnType<typeof setTimeout>>();

const stopOwnerTimer = (channelId: string) => {
  clearTimeout(ownerAway.get(channelId));
  ownerAway.delete(channelId);
};

/**
 * After someone comes or goes: deletes a channel that's empty, and gives one whose owner has been gone a little while to someone
 * still there. Also run for every channel on start, for whatever happened while the bot was away.
 */
export function settleTempChannel(channel: VoiceChannel, ownerGrace = OWNER_GRACE): Promise<void> {
  return queue.run(`channel:${channel.id}`, async () => {
    const temp = await findTempChannel(channel.guild, channel.id);
    if (!temp) return;
    const here = people(channel);

    if (here.size === 0) {
      await deleteTempChannel(temp);
      return;
    }
    if (here.has(temp.record.ownerId)) {
      stopOwnerTimer(channel.id);
    } else if (!ownerGrace) {
      const oldOwnerId = temp.record.ownerId;
      const newOwner = here.first()!;
      await giveTo(temp, newOwner.id);
      const t = guildTranslate(channel.guild);
      await announce(temp, t('tempVoice.announce.ownerLeft', { old: userMention(oldOwnerId), new: userMention(newOwner.id) }), [newOwner.id]);
      return;
    } else if (!ownerAway.has(channel.id)) {
      ownerAway.set(
        channel.id,
        setTimeout(() => {
          ownerAway.delete(channel.id);
          settleTempChannel(channel, 0).catch((error: unknown) => logger.error(error, 'Failed to hand over a temporary voice channel'));
        }, ownerGrace),
      );
    }
    refreshPanel(temp);
  });
}

/** Deletes a temporary channel and forgets it. */
export async function deleteTempChannel(temp: TempChannel) {
  stopOwnerTimer(temp.channel.id);
  await deleteTempVoiceChannel(temp.channel.id);
  await temp.channel.delete('Temporary voice channel is empty').catch((error: unknown) => logger.debug(error, 'Temporary voice channel was already gone'));
}

/** Forgets a temporary channel someone deleted by hand. */
export async function forgetTempChannel(channelId: string) {
  stopOwnerTimer(channelId);
  await deleteTempVoiceChannel(channelId);
}

/** Reads a channel's record again, for a change that waited its turn and may be out of date by now. False if it's gone. */
async function reread(temp: TempChannel) {
  const record = await getTempVoiceChannel(temp.channel.id);
  if (!record || !temp.channel.guild.channels.cache.has(temp.channel.id)) return false;
  temp.record = record;
  return true;
}

/**
 * Give a channel to someone else from its panel, in turn with other changes to it, if whoever asked still may.
 * @returns Who owned it before, or null if it wasn't handed over: it's gone, or changed hands in the meantime.
 */
export function handOver(temp: TempChannel, by: GuildMember, newOwnerId: string) {
  return queue.run(`channel:${temp.channel.id}`, async () => {
    if (!(await reread(temp)) || !canChange(by, temp) || temp.record.ownerId === newOwnerId) return null;
    const oldOwnerId = temp.record.ownerId;
    await giveTo(temp, newOwnerId);
    return oldOwnerId;
  });
}

/** Gives a channel to someone else, for work already in the channel's turn. */
async function giveTo(temp: TempChannel, newOwnerId: string) {
  const oldOwnerId = temp.record.ownerId;
  // The new owner is let in as owner, not on the lists, and can't keep themselves out
  const change = {
    ownerId: newOwnerId,
    allowed: temp.record.allowed.filter((id) => id !== newOwnerId),
    blocked: temp.record.blocked.filter((id) => id !== newOwnerId),
    moderators: temp.record.moderators.filter((id) => id !== newOwnerId),
  };
  await applyAccess(temp.channel, { ...temp.record, ...change });
  temp.record = await updateTempVoiceChannel(temp.channel.id, change);
  // Nice to have: the hand-over stands even if this fails
  await renameForNewOwner(temp, oldOwnerId, newOwnerId).catch((error: unknown) => logger.error(error, 'Failed to rename a handed-over voice channel'));
  refreshPanel(temp);
}

/**
 * A channel still named after its old owner takes the name the new owner's own channel would have: their saved one, or their
 * display name. One its owner named themselves, like for what everyone's doing in it, keeps its name.
 */
async function renameForNewOwner(temp: TempChannel, oldOwnerId: string, newOwnerId: string) {
  const { guild } = temp.channel;
  const [oldOwner, newOwner] = await Promise.all([guild.members.fetch(oldOwnerId).catch(() => null), guild.members.fetch(newOwnerId).catch(() => null)]);
  // Someone who's left the server has no display name to compare with, so the name stays
  if (!oldOwner || !newOwner || channelLabel(temp.record.namePrefix, temp.channel.name) !== oldOwner.displayName) return;

  const settings = await getTempVoiceSettings(guild.id, newOwnerId);
  const name = channelName(temp.record.namePrefix, settings?.name ?? newOwner.displayName);
  if (name === temp.channel.name) return;
  // Discord only allows so many renames, and if it won't now, the old name stays and the new owner can rename it
  await temp.channel
    .setName(name, 'Temporary voice channel handed to someone else')
    .catch((error: unknown) => logger.debug(error, 'Could not rename a handed-over voice channel'));
}

export type Change = Partial<Access> & { name?: string; userLimit?: number };

/**
 * A change someone made to a channel from its panel. Given as a function, it's worked out from the channel as it is once it's this
 * change's turn, like adding one person to a list. Nothing changes if the channel is gone, or whoever made it no longer may change it.
 * Saved as the owner's settings for next time when it's the owner who made it.
 * @returns When it can be tried again, if Discord won't change the channel yet.
 */
export function changeTempChannel(temp: TempChannel, by: GuildMember, change: Change | ((record: TempVoiceChannel) => Change)) {
  return queue.run(`channel:${temp.channel.id}`, async (): Promise<{ retryAt: Date } | void> => {
    // A change made just before this one, or a hand-over, may have changed it since it was read
    if (!(await reread(temp))) return;
    const changed = typeof change === 'function' ? change(temp.record) : change;
    if (!(isModeratorChange(changed) ? canModerate(by, temp) : canChange(by, temp))) return;
    const { name, userLimit, ...access } = changed;
    const before = { name: temp.channel.name, userLimit: temp.channel.userLimit, ...temp.record };

    if ((name !== undefined && name !== temp.channel.name) || (userLimit !== undefined && userLimit !== temp.channel.userLimit)) {
      try {
        await temp.channel.edit({ name, userLimit, reason: `Temporary voice channel changed by ${by.user.tag}` });
      } catch (error) {
        if (error instanceof RateLimitError) return { retryAt: new Date(Date.now() + error.timeToReset) };
        throw error;
      }
    }

    if (Object.keys(access).length > 0) {
      // Nobody's both let in and kept out, and the owner is neither. Moderators are always let in, so they can't be kept out either
      const { ownerId } = temp.record;
      const moderators = (access.moderators ?? temp.record.moderators).filter((id) => id !== ownerId).slice(0, MAX_MODERATORS);
      const allowed = (access.allowed ?? temp.record.allowed).filter((id) => id !== ownerId && !access.blocked?.includes(id));
      const blocked = (access.blocked ?? temp.record.blocked).filter((id) => id !== ownerId && !moderators.includes(id) && !access.allowed?.includes(id));
      const saved = { ...access, allowed, blocked, moderators };
      try {
        await applyAccess(temp.channel, { ...temp.record, ...saved });
      } catch (error) {
        if (error instanceof RateLimitError) return { retryAt: new Date(Date.now() + error.timeToReset) };
        throw error;
      }
      temp.record = await updateTempVoiceChannel(temp.channel.id, saved);
      // Anyone kept out who's still here has to go
      for (const id of blocked) {
        const member = temp.channel.members.get(id);
        if (member)
          await member.voice
            .disconnect('Kept out of a temporary voice channel')
            .catch((error: unknown) => logger.error(error, 'Failed to remove a kept out member'));
      }
    }

    if (by.id === temp.record.ownerId) {
      const owner = temp.channel.members.get(by.id) ?? by;
      const label = channelLabel(temp.record.namePrefix, temp.channel.name);
      await saveTempVoiceSettings(temp.channel.guild.id, by.id, {
        // Not saved while it's still their display name, so it follows a new one
        name: label === owner.displayName ? null : label,
        userLimit: temp.channel.userLimit,
        locked: temp.record.locked,
        hidden: temp.record.hidden,
        allowed: temp.record.allowed,
        blocked: temp.record.blocked,
        moderators: temp.record.moderators,
      });
    }
    refreshPanel(temp);

    const t = guildTranslate(temp.channel.guild);
    const changes = describeChanges(before, { name: temp.channel.name, userLimit: temp.channel.userLimit, ...temp.record }, t);
    if (changes.length > 0)
      await announce(temp, [t('tempVoice.announce.changed', { user: userMention(by.id) }), ...changes.map((line) => `- ${line}`)].join('\n'));
  });
}

type Described = Access & { name: string; userLimit: number; namePrefix: string };

/** What changed about a channel, as things someone did to it, for everyone in it to see. */
export function describeChanges(before: Described, after: Described, t: Translate): string[] {
  const changes: string[] = [];
  const added = (from: string[], to: string[]) => to.filter((id) => !from.includes(id));
  const mentions = (ids: string[]) => ids.map((id) => userMention(id)).join(', ');

  if (after.name !== before.name) changes.push(t('tempVoice.announce.renamed', { name: channelLabel(after.namePrefix, after.name) }));
  if (after.userLimit !== before.userLimit)
    changes.push(after.userLimit ? t('tempVoice.announce.limit', { count: after.userLimit }) : t('tempVoice.announce.noLimit'));
  if (after.locked !== before.locked) changes.push(t(after.locked ? 'tempVoice.announce.locked' : 'tempVoice.announce.unlocked'));
  if (after.hidden !== before.hidden) changes.push(t(after.hidden ? 'tempVoice.announce.hidden' : 'tempVoice.announce.shown'));

  const letIn = added(before.allowed, after.allowed);
  const keptOut = added(before.blocked, after.blocked);
  // Moving someone from one list to the other is said once, as where they went
  const noLongerLetIn = added(after.allowed, before.allowed).filter((id) => !keptOut.includes(id));
  const letBackIn = added(after.blocked, before.blocked).filter((id) => !letIn.includes(id));
  if (letIn.length > 0) changes.push(t('tempVoice.announce.allowed', { users: mentions(letIn) }));
  if (keptOut.length > 0) changes.push(t('tempVoice.announce.blocked', { users: mentions(keptOut) }));
  if (noLongerLetIn.length > 0) changes.push(t('tempVoice.announce.unallowed', { users: mentions(noLongerLetIn) }));
  if (letBackIn.length > 0) changes.push(t('tempVoice.announce.unblocked', { users: mentions(letBackIn) }));

  const newModerators = added(before.moderators, after.moderators);
  const noLongerModerators = added(after.moderators, before.moderators);
  if (newModerators.length > 0) changes.push(t('tempVoice.announce.moderators', { users: mentions(newModerators), count: newModerators.length }));
  if (noLongerModerators.length > 0)
    changes.push(t('tempVoice.announce.unmoderators', { users: mentions(noLongerModerators), count: noLongerModerators.length }));
  return changes;
}

/**
 * For the REST manager: Discord only lets a channel be changed so often, a rename only a couple of times every ten minutes, and waiting
 * that out would leave the owner looking at a spinner. Such a wait throws a RateLimitError instead, for {@link changeTempChannel}.
 * Only for editing a channel itself, not messages in it.
 */
export function isRenameLimit(data: RateLimitData) {
  return data.method.toUpperCase() === 'PATCH' && /^\/channels\/[^/]+$/.test(data.route) && data.timeToReset > 5 * SECOND;
}
