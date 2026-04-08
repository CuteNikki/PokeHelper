import { Client, userMention } from 'discord.js';
import cron from 'node-cron';

import { prisma } from 'database/index';

import type { UserBirthday } from 'generated/prisma/client';

export function startBirthdayCron(client: Client) {
  cron.schedule('0 * * * *', async () => {
    const allBirthdays = await prisma.userBirthday.findMany();

    for (const bday of allBirthdays) {
      const userNow = new Date(new Date().toLocaleString('en-US', { timeZone: bday.timezone ?? undefined }));

      const isBirthdayMonth = userNow.getMonth() === bday.date.getMonth();
      const isBirthdayDay = userNow.getDate() === bday.date.getDate();

      const isAnnouncementHour = userNow.getHours() === 8;

      if (isBirthdayMonth && isBirthdayDay && isAnnouncementHour) {
        await announceBirthday(client, bday);
      }
    }
  });
}

async function announceBirthday(client: Client, bdayConfig: UserBirthday) {
  const configuredGuilds = await prisma.guildBirthday.findMany();

  for (const guildConfig of configuredGuilds) {
    const wantsAnnouncementHere = bdayConfig.announceInGuildsByDefault || bdayConfig.announceInGuildIds.includes(guildConfig.guildId);

    if (!wantsAnnouncementHere) continue;

    const guild = client.guilds.cache.get(guildConfig.guildId);
    if (!guild) continue;

    const member = await guild.members.fetch(bdayConfig.userId).catch(() => null);
    if (!member) continue;

    const channel = guild.channels.cache.get(guildConfig.channelId);
    if (channel && channel.isTextBased()) {
      let ageText = '';
      if (bdayConfig.showAge) {
        const userNow = new Date(new Date().toLocaleString('en-US', { timeZone: bdayConfig.timezone ?? undefined }));
        const age = userNow.getFullYear() - bdayConfig.date.getFullYear();
        ageText = ` They are turning **${age}** today!`;
      }

      await channel
        .send({
          content: `🎉 Happy Birthday to ${userMention(bdayConfig.userId)}!${ageText} 🎂🎈`,
        })
        .catch(console.error);
    }
  }
}
