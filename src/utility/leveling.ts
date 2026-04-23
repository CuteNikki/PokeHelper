import { Client } from 'discord.js';

import { getActiveLevelingConfigs, getTopWeeklyUsersByXP, processWeeklyResetTransaction } from 'database/leveling';

import { logger } from 'utility/logger';

export const startWeeklyCron = (client: Client) => {
  Bun.cron('0 0 * * 1', async () => {
    logger.info('Triggering weekly XP reset...');

    const guildConfigs = await getActiveLevelingConfigs();

    for (const config of guildConfigs) {
      try {
        const guildId = config.guildId;
        const roleId = config.weeklyReward;

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        if (roleId && config.weeklyLastWinner) {
          const prevWinner = await guild.members.fetch(config.weeklyLastWinner).catch(() => null);
          if (prevWinner) {
            await prevWinner.roles.remove(roleId).catch((err) => logger.error(err, `Failed to remove weekly role from ${config.weeklyLastWinner}:`));
          }
        }

        const topUsers = await getTopWeeklyUsersByXP(guildId, 1);
        const topUser = topUsers[0];

        let newWinnerId: string | null = null;

        if (topUser && topUser.xp > 0) {
          newWinnerId = topUser.userId;

          if (roleId) {
            const newWinner = await guild.members.fetch(topUser.userId).catch(() => null);
            if (newWinner) {
              await newWinner.roles.add(roleId).catch((err) => logger.error(err, `Failed to add weekly role to ${topUser.userId}:`));
            }
          }
        }

        await processWeeklyResetTransaction(guildId, newWinnerId);
      } catch (error) {
        logger.error(error, `Error processing weekly reset for guild ${config.guildId}:`);
      }
    }

    logger.info('Weekly leveling reset complete.');
  });
};
