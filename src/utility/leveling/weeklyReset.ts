import { ContainerBuilder, MessageFlags, TextDisplayBuilder, userMention, type Client } from 'discord.js';

import { getActiveLevelingConfigs, getLevelFromXP, getTopWeeklyUsersByXP, processWeeklyResetTransaction } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { isWeeklyResetDue } from 'utility/leveling/rules';
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

      // The role the last winner got, which may not be the one set now. Winners from before that was remembered got the one set now
      const previousRole = config.weeklyWinnerRole ?? roleId;
      if (previousRole && config.weeklyLastWinner) {
        const prevWinner = await guild.members.fetch(config.weeklyLastWinner).catch(() => null);
        if (prevWinner?.roles.cache.has(previousRole)) {
          await prevWinner.roles
            .remove(previousRole)
            .catch((err: unknown) => logger.error(err, `Failed to remove weekly role from ${config.weeklyLastWinner}:`));
        }
      }

      const topUsers = await getTopWeeklyUsersByXP(guildId, 5, 0, 'desc');
      const topUser = topUsers[0]?.xp ? topUsers[0] : undefined;

      // Always recorded, also without a winner, so the reset isn't due again until next week
      const newWinner = topUser && canGiveWeeklyRole ? await guild.members.fetch(topUser.userId).catch(() => null) : null;
      const gaveRole = newWinner
        ? await newWinner.roles.add(roleId!).then(
            () => true,
            (err: unknown) => {
              logger.error(err, `Failed to add weekly role to ${topUser!.userId}:`);
              return false;
            },
          )
        : false;
      await processWeeklyResetTransaction(guildId, topUser?.userId ?? null, gaveRole ? roleId : null);
      if (!topUser) continue;

      const channel = config.channelId ? guild.channels.cache.get(config.channelId) : undefined;
      if (!channel?.isSendable()) continue;

      const format = (value: number) => value.toLocaleString(t('locale'));
      const ranking = topUsers.map((entry, index) =>
        t('leveling.leaderboard.entry', {
          user: userMention(entry.userId),
          level: format(getLevelFromXP(entry.xp)),
          xp: format(entry.xp),
          position: format(index + 1),
        }),
      );
      await channel
        .send({
          components: [
            new ContainerBuilder()
              .setAccentColor(ThemeColors.warning)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  [t('leveling.weeklyReset.message', { winner: userMention(topUser.userId), xp: format(topUser.xp) }), ...ranking].join('\n'),
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
