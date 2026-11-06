import { ContainerBuilder, MessageFlags, TextDisplayBuilder, userMention, type Client } from 'discord.js';

import { getActiveLevelingConfigs, getLevelFromXP, getTopUsersByXP, processResetTransaction, type ResetPeriod } from 'database/leveling';

import type { GuildLeveling } from 'generated/prisma/client';
import { formatNumber } from 'utility/duration';
import { guildTranslate } from 'utility/i18next';
import { isResetDue } from 'utility/leveling/rules';
import { logger } from 'utility/logger';
import { canGiveRole } from 'utility/roles';
import { ThemeColors } from 'utility/theme';

/** A server's settings and state of the weekly or monthly winner. */
function resetState(config: GuildLeveling, period: ResetPeriod) {
  return period === 'weekly'
    ? {
        reward: config.weeklyReward,
        lastResetAt: config.weeklyLastResetAt,
        lastWinner: config.weeklyLastWinner,
        winnerRole: config.weeklyWinnerRole,
        announce: config.weeklyResetMessages,
      }
    : {
        reward: config.monthlyReward,
        lastResetAt: config.monthlyLastResetAt,
        lastWinner: config.monthlyLastWinner,
        winnerRole: config.monthlyWinnerRole,
        announce: config.monthlyResetMessages,
      };
}

/**
 * Reset the weekly or monthly XP of every server where a new week or month started since the last reset, crown the winner and announce them.
 * Runs regularly instead of only right when it starts, so a week or month isn't skipped when the bot was offline then.
 */
export async function runResetJob(client: Client, period: ResetPeriod) {
  const now = new Date();
  const guildConfigs = (await getActiveLevelingConfigs()).filter((config) => isResetDue(period, resetState(config, period).lastResetAt, config.createdAt, now));

  for (const config of guildConfigs) {
    try {
      const guildId = config.guildId;
      const state = resetState(config, period);
      const roleId = state.reward;

      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      // Everyone in the channel sees the announcement, so it's in the server's language
      const t = guildTranslate(guild);
      const canGiveRewardRole = roleId !== null && canGiveRole(guild, roleId);

      // The role the last winner got, which may not be the one set now. Winners from before that was remembered got the one set now
      const previousRole = state.winnerRole ?? roleId;
      // Kept when they also hold it as the other period's winner, like when weekly and monthly give the same role
      const other = resetState(config, period === 'weekly' ? 'monthly' : 'weekly');
      const keptByOther = other.lastWinner === state.lastWinner && (other.winnerRole ?? other.reward) === previousRole;
      if (previousRole && state.lastWinner && !keptByOther) {
        const prevWinner = await guild.members.fetch(state.lastWinner).catch(() => null);
        if (prevWinner?.roles.cache.has(previousRole)) {
          await prevWinner.roles.remove(previousRole).catch((err: unknown) => logger.error(err, `Failed to remove ${period} role from ${state.lastWinner}:`));
        }
      }

      const topUsers = await getTopUsersByXP(guildId, period, 5, 0, 'desc');
      const topUser = topUsers[0]?.xp ? topUsers[0] : undefined;

      // Always recorded, also without a winner, so the reset isn't due again until the next week or month
      const newWinner = topUser && canGiveRewardRole ? await guild.members.fetch(topUser.userId).catch(() => null) : null;
      const gaveRole = newWinner
        ? await newWinner.roles.add(roleId!).then(
            () => true,
            (err: unknown) => {
              logger.error(err, `Failed to add ${period} role to ${topUser!.userId}:`);
              return false;
            },
          )
        : false;
      await processResetTransaction(guildId, period, topUser?.userId ?? null, gaveRole ? roleId : null);
      // Without the announcement, the reset and the role still happen
      if (!topUser || !state.announce) continue;

      const channel = config.winnersChannelId ? guild.channels.cache.get(config.winnersChannelId) : undefined;
      if (!channel?.isSendable()) continue;
      const ranking = topUsers.map((entry, index) =>
        t('leveling.leaderboard.entry', {
          user: userMention(entry.userId),
          level: formatNumber(getLevelFromXP(entry.xp), t),
          xp: formatNumber(entry.xp, t),
          position: formatNumber(index + 1, t),
        }),
      );
      await channel
        .send({
          components: [
            new ContainerBuilder()
              .setAccentColor(ThemeColors.warning)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  [t(`leveling.${period}Reset.message`, { winner: userMention(topUser.userId), xp: formatNumber(topUser.xp, t) }), ...ranking].join('\n'),
                ),
              ),
          ],
          flags: [MessageFlags.IsComponentsV2],
          allowedMentions: { users: [] },
        })
        .catch((err: unknown) => logger.error(err, `Failed to send ${period} winner announcement in guild ${guildId}:`));
    } catch (error) {
      logger.error(error, `Error processing ${period} reset for guild ${config.guildId}:`);
    }
  }
}
