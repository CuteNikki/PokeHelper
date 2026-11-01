import { ContainerBuilder, MessageFlags, TextDisplayBuilder, userMention, type Client } from 'discord.js';

import { getActiveLevelingConfigs, getLevelFromXP, getTopWeeklyUsersByXP, processWeeklyResetTransaction } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { isWeeklyResetDue } from 'utility/levelingRules';
import { logger } from 'utility/logger';
import { canGiveRole } from 'utility/roles';
import { ThemeColors } from 'utility/theme';

/**
 * Reset the weekly XP of every server where a new week started since the last reset, crown the winner and announce them.
 * Runs regularly instead of only at Monday 00:00, so a week isn't skipped when the bot was offline then.
 */
export async function runWeeklyResetJob(client: Client) {
  const now = new Date();
  const guildConfigs = (await getActiveLevelingConfigs()).filter((config) => isWeeklyResetDue(config.weeklyLastResetAt, config.createdAt, now));

  for (const config of guildConfigs) {
    try {
      const guildId = config.guildId;
      const roleId = config.weeklyReward;

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      // Everyone in the channel sees the announcement, so it's in the server's language
      const t = getTranslate(guild.preferredLocale);
      const canGiveWeeklyRole = roleId !== null && canGiveRole(guild, roleId);

      if (canGiveWeeklyRole && config.weeklyLastWinner) {
        const prevWinner = await guild.members.fetch(config.weeklyLastWinner).catch(() => null);
        await prevWinner?.roles.remove(roleId).catch((err: unknown) => logger.error(err, `Failed to remove weekly role from ${config.weeklyLastWinner}:`));
      }

      const topUsers = await getTopWeeklyUsersByXP(guildId, 5, 0, 'desc');
      const topUser = topUsers[0]?.xp ? topUsers[0] : undefined;

      // Always recorded, also without a winner, so the reset isn't due again until next week
      await processWeeklyResetTransaction(guildId, topUser?.userId ?? null);
      if (!topUser) continue;

      if (canGiveWeeklyRole) {
        const newWinner = await guild.members.fetch(topUser.userId).catch(() => null);
        await newWinner?.roles.add(roleId).catch((err: unknown) => logger.error(err, `Failed to add weekly role to ${topUser.userId}:`));
      }

      const channel = config.channelId ? guild.channels.cache.get(config.channelId) : undefined;
      if (!channel?.isSendable()) continue;

      const ranking = topUsers.map((entry, index) =>
        t('leveling.leaderboard.entry', { user: userMention(entry.userId), level: getLevelFromXP(entry.xp), xp: entry.xp, position: index + 1 }),
      );
      await channel
        .send({
          components: [
            new ContainerBuilder()
              .setAccentColor(ThemeColors.warning)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  [t('leveling.weeklyReset.message', { winner: userMention(topUser.userId), xp: topUser.xp }), ...ranking].join('\n'),
                ),
              ),
          ],
          flags: [MessageFlags.IsComponentsV2],
          allowedMentions: { users: [] },
        })
        .catch((err: unknown) => logger.error(err, `Failed to send weekly winner announcement in guild ${guildId}:`));
    } catch (error) {
      logger.error(error, `Error processing weekly reset for guild ${config.guildId}:`);
    }
  }
}
