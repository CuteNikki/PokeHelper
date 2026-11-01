import { userMention, type Client } from 'discord.js';

import { prisma } from 'database/index';

import type { GuildBirthday, UserBirthday } from 'generated/prisma/client';
import { ageInYear, getBirthdayActions } from 'utility/birthdayDates';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse } from 'utility/response';
import { canGiveRole } from 'utility/roles';

/**
 * Give out and take away birthday roles and announce birthdays, for whatever is due.
 * Runs regularly, and what was done is saved, so nothing is done twice and a missed run is caught up on.
 */
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
}

async function announceBirthday(client: Client, birthday: UserBirthday, guildConfigs: GuildBirthday[], year: number) {
  for (const guildConfig of guildConfigs) {
    if (!guildConfig.enabled || !guildConfig.channelId) continue;
    if (!birthday.announceInGuildsByDefault && !birthday.announceInGuildIds.includes(guildConfig.guildId)) continue;

    const guild = client.guilds.cache.get(guildConfig.guildId);
    const member = await guild?.members.fetch(birthday.userId).catch(() => null);
    const channel = guild?.channels.cache.get(guildConfig.channelId);
    if (!guild || !member || !channel?.isSendable()) continue;

    // Everyone in the channel sees it, so it's in the server's language
    const t = getTranslate(guild.preferredLocale);
    const content = birthday.showAge
      ? t('birthday.announcement.withAge', { user: userMention(birthday.userId), age: ageInYear(birthday.date, year) })
      : t('birthday.announcement.message', { user: userMention(birthday.userId) });

    await channel
      // Pings the birthday member, so they see the wishes
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
    const member = await guild.members.fetch(birthday.userId).catch(() => null);
    if (!member) continue;

    const hasRole = member.roles.cache.has(guildConfig.roleId);
    try {
      if (action === 'add' && !hasRole) await member.roles.add(guildConfig.roleId);
      if (action === 'remove' && hasRole) await member.roles.remove(guildConfig.roleId);
    } catch (error) {
      logger.error(error, `Failed to ${action} the birthday role of ${birthday.userId} in guild ${guild.id}`);
    }
  }
}
