import { Client, userMention } from 'discord.js';
import { t } from 'i18next';
import cron from 'node-cron';

import { prisma } from 'database/index';

import type { UserBirthday } from 'generated/prisma/client';
import { logger } from 'utility/logger';

export async function startBirthdayCron(client: Client) {
  cron.schedule('0 * * * *', async () => {
    const allBirthdays = await prisma.userBirthday.findMany();

    for (const bday of allBirthdays) {
      const userNow = new Date(new Date().toLocaleString('en-US', { timeZone: bday.timezone ?? undefined }));

      const isBirthdayMonth = userNow.getMonth() === bday.date.getMonth();
      const isBirthdayDay = userNow.getDate() === bday.date.getDate();
      const isAnnouncementHour = userNow.getHours() === 8;

      if (isBirthdayMonth && isBirthdayDay) {
        if (userNow.getHours() === 0) {
          await manageBirthdayRole(client, bday, 'add');
        }
        if (isAnnouncementHour) {
          await announceBirthday(client, bday);
        }
      }

      const yesterday = new Date(userNow);
      yesterday.setDate(yesterday.getDate() - 1);
      if (yesterday.getMonth() === bday.date.getMonth() && yesterday.getDate() === bday.date.getDate() && userNow.getHours() === 0) {
        await manageBirthdayRole(client, bday, 'remove');
      }
    }
  });
}

async function announceBirthday(client: Client, bdayConfig: UserBirthday) {
  const configuredGuilds = await prisma.guildBirthday.findMany({
    where: { enabled: true, NOT: { channelId: null } },
  });

  for (const guildConfig of configuredGuilds) {
    const wantsAnnouncementHere = bdayConfig.announceInGuildsByDefault || bdayConfig.announceInGuildIds.includes(guildConfig.guildId);

    if (!wantsAnnouncementHere) continue;

    const guild = client.guilds.cache.get(guildConfig.guildId);
    if (!guild) continue;

    const member = await guild.members.fetch(bdayConfig.userId).catch(() => null);
    if (!member) continue;

    const channel = guild.channels.cache.get(guildConfig.channelId!);
    if (channel && channel.isTextBased()) {
      const userNow = new Date(new Date().toLocaleString('en-US', { timeZone: bdayConfig.timezone ?? undefined }));
      const age = userNow.getFullYear() - bdayConfig.date.getFullYear();

      await channel
        .send({
          content: bdayConfig.showAge
            ? t('birthday.announcement.withAge', { user: userMention(bdayConfig.userId), age })
            : t('birthday.announcement.message', { user: userMention(bdayConfig.userId) }),
        })
        .catch((err) => logger.error(err, 'Failed to send birthday announcement:'));
    }
  }
}

async function manageBirthdayRole(client: Client, bdayConfig: UserBirthday, action: 'add' | 'remove') {
  const configuredGuilds = await prisma.guildBirthday.findMany({
    where: { enabled: true, NOT: { roleId: null } },
  });

  for (const guildConfig of configuredGuilds) {
    const guild = client.guilds.cache.get(guildConfig.guildId);
    if (!guild) continue;

    const member = await guild.members.fetch(bdayConfig.userId).catch(() => null);
    if (!member) continue;

    const role = guild.roles.cache.get(guildConfig.roleId!);
    if (!role) continue;

    try {
      if (action === 'add' && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
      } else if (action === 'remove' && member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
      }
    } catch (err) {
      logger.error(err, `Failed to ${action} role in ${guild.name}:`);
    }
  }
}
