import { userMention, type Client } from 'discord.js';

import { prisma } from 'database/index';

import type { GuildBirthday, UserBirthday } from 'generated/prisma/client';
import { ageInYear, getBirthdayActions } from 'utility/birthday/dates';
import { findMember } from 'utility/discord';
import { guildTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse } from 'utility/response';
import { canGiveRole } from 'utility/roles';

/** Give out and take away birthday roles and announce birthdays. What was done is saved, so nothing happens twice and missed runs catch up. */
export async function runBirthdayJob(client: Client) {
  const [birthdays, guildConfigs] = await Promise.all([prisma.userBirthday.findMany(), prisma.guildBirthday.findMany()]);
  const now = new Date();

  for (const birthday of birthdays) {
    const actions = getBirthdayActions(birthday, birthday, now);

    try {
      // Saved right after each step, so a failure later on doesn't repeat what already happened
      if (actions.giveRole) {
        await updateBirthdayRoles(client, birthday, guildConfigs, 'add');
        await prisma.userBirthday.update({ where: { userId: birthday.userId }, data: { roleYear: actions.year, roleActive: true } });
      }
      if (actions.announce) {
        await announceBirthday(client, birthday, guildConfigs, actions.year);
        await prisma.userBirthday.update({ where: { userId: birthday.userId }, data: { announcedYear: actions.year } });
      }
      if (actions.removeRole) {
        await updateBirthdayRoles(client, birthday, guildConfigs, 'remove');
        await prisma.userBirthday.update({ where: { userId: birthday.userId }, data: { roleActive: false } });
      }
    } catch (error) {
      logger.error(error, `Failed to handle the birthday of ${birthday.userId}`);
    }
  }

  await removeEndedBirthdayRoles(client);
}

/**
 * Take away the birthday roles the bot gave for birthdays that are over, and for birthdays that were deleted meanwhile.
 * The role that was given is taken away, even if the server picked another birthday role since or reset its settings.
 */
async function removeEndedBirthdayRoles(client: Client) {
  const [given, active] = await Promise.all([
    prisma.birthdayRole.findMany(),
    prisma.userBirthday.findMany({ where: { roleActive: true }, select: { userId: true } }),
  ]);
  const activeUserIds = new Set(active.map((birthday) => birthday.userId));

  for (const role of given) {
    if (activeUserIds.has(role.userId)) continue;
    // The server may only be unavailable for a moment, so it's tried again next time
    const guild = client.guilds.cache.get(role.guildId);
    if (!guild) continue;

    const member = await findMember(guild, role.userId);
    if (member?.roles.cache.has(role.roleId)) {
      // Tried once, as a role the bot can't take away anymore, like one moved above its own, would fail every time
      await member.roles
        .remove(role.roleId)
        .catch((error: unknown) => logger.warn(error, `Failed to take away the birthday role ${role.roleId} of ${role.userId} in guild ${guild.id}`));
    }
    await prisma.birthdayRole.delete({ where: { guildId_userId: { guildId: role.guildId, userId: role.userId } } });
  }
}

async function announceBirthday(client: Client, birthday: UserBirthday, guildConfigs: GuildBirthday[], year: number) {
  for (const guildConfig of guildConfigs) {
    if (!guildConfig.enabled || !guildConfig.channelId) continue;
    if (!birthday.announceInGuildsByDefault && !birthday.announceInGuildIds.includes(guildConfig.guildId)) continue;

    const guild = client.guilds.cache.get(guildConfig.guildId);
    const member = guild ? await findMember(guild, birthday.userId) : null;
    const channel = guild?.channels.cache.get(guildConfig.channelId);
    if (!guild || !member || !channel?.isSendable()) continue;

    // Everyone in the channel sees it, so it's in the server's language
    const t = guildTranslate(guild);
    const content = birthday.showAge
      ? t('birthday.announcement.withAge', { user: userMention(birthday.userId), age: ageInYear(birthday.date, year) })
      : t('birthday.announcement.message', { user: userMention(birthday.userId) });

    await channel
      .send({ ...createResponse(content, 'success'), allowedMentions: { users: [birthday.userId] } })
      .catch((error: unknown) => logger.error(error, `Failed to announce the birthday of ${birthday.userId} in guild ${guild.id}`));
  }
}

/**
 * Give or take away the birthday role in every server that has one.
 * Taking it away also covers servers where birthdays were turned off since, so the role doesn't stay forever.
 */
async function updateBirthdayRoles(client: Client, birthday: UserBirthday, guildConfigs: GuildBirthday[], action: 'add' | 'remove') {
  for (const guildConfig of guildConfigs) {
    if (!guildConfig.roleId || (action === 'add' && !guildConfig.enabled)) continue;

    const guild = client.guilds.cache.get(guildConfig.guildId);
    if (!guild || !canGiveRole(guild, guildConfig.roleId)) continue;
    const member = await findMember(guild, birthday.userId);
    if (!member) continue;

    const hasRole = member.roles.cache.has(guildConfig.roleId);
    try {
      if (action === 'add') {
        if (!hasRole) await member.roles.add(guildConfig.roleId);
        // Remembered, so this role is taken away when the birthday is over, whatever changes meanwhile
        const key = { guildId: guild.id, userId: birthday.userId };
        await prisma.birthdayRole.upsert({
          where: { guildId_userId: key },
          create: { ...key, roleId: guildConfig.roleId },
          update: { roleId: guildConfig.roleId },
        });
      }
      // Also covers roles given before they were remembered
      if (action === 'remove' && hasRole) await member.roles.remove(guildConfig.roleId);
    } catch (error) {
      logger.error(error, `Failed to ${action} the birthday role of ${birthday.userId} in guild ${guild.id}`);
    }
  }
}
