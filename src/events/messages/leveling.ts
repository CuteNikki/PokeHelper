import { Collection, Colors, EmbedBuilder, Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { addXpToUser, addXpToUserWeekly, getGuildLevelingConfiguration, getLevelFromXP } from 'database/leveling';
import { getUserData } from 'database/user';

import { logger } from 'utility/logger';

export default new Event({
  name: Events.MessageCreate,
  once: false,
  async execute(client, message) {
    // Ignore bot messages and non-guild messages
    if (message.author.bot || !message.inGuild()) return;

    const levelingConfig = await getGuildLevelingConfiguration(message.guildId).catch((err) =>
      logger.error(err, 'Failed to fetch leveling configuration for guild {guildId}', { guildId: message.guildId }),
    );
    if (!levelingConfig || !levelingConfig.enabled) return; // If leveling is not configured or disabled, do nothing

    // If the channel is ignored, do nothing
    if (levelingConfig.ignoredChannels.includes(message.channelId)) return;
    // If there are enabled channels configured and this channel is not one of them, do nothing
    if (levelingConfig.enabledChannels.length > 0 && !levelingConfig.enabledChannels.includes(message.channelId)) return;

    const memberRoleIds = message.member?.roles.cache.map((r) => r.id);
    // If the user has an ignored role, do nothing
    if (levelingConfig.ignoredRoles.some((roleId) => memberRoleIds?.includes(roleId))) return;
    // If there are enabled roles configured and the user doesn't have any of them, do nothing
    if (levelingConfig.enabledRoles.length > 0 && !levelingConfig.enabledRoles.some((roleId) => memberRoleIds?.includes(roleId))) return;

    const cooldowns = client.cooldowns;
    if (!cooldowns.has('leveling')) {
      cooldowns.set('leveling', new Collection());
    }

    const timestamps = cooldowns.get('leveling')!;
    const cooldownAmount = 60 * 1000; // 60 seconds
    const userId = message.author.id;
    const now = Date.now();

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId)! + cooldownAmount;
      if (now < expirationTime) return; // User is still on cooldown, do nothing
    }

    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);

    // Random XP between 15 and 25
    const xpToAdd = Math.floor(Math.random() * (25 - 15 + 1)) + 15;

    await getUserData(message.author.id).catch((err) => logger.error(err, 'Failed to fetch user data for {userId}', { userId: message.author.id })); // make sure user exists in database
    const userLevelingData = await addXpToUser(message.guildId, userId, xpToAdd).catch((err) =>
      logger.error(err, 'Failed to add XP for user {userId} in guild {guildId}', { userId, guildId: message.guildId }),
    );
    // Add XP to weekly leaderboard as well
    await addXpToUserWeekly(message.guildId, userId, xpToAdd).catch((err) =>
      logger.error(err, 'Failed to add weekly XP for user {userId} in guild {guildId}', { userId, guildId: message.guildId }),
    );

    const newXp = userLevelingData?.xp ?? 0;
    const oldXp = newXp - xpToAdd;

    const newLevel = getLevelFromXP(newXp);
    const oldLevel = getLevelFromXP(oldXp);

    // User leveled up, check for rewards
    if (newLevel > oldLevel) {
      const rewardsToGive = levelingConfig.rewards.filter((reward) => reward.level > oldLevel && reward.level <= newLevel);

      if (rewardsToGive.length > 0) {
        const roleIdsToGive = rewardsToGive.map((reward) => reward.roleId);
        await message.member?.roles.add(roleIdsToGive).catch((err) => {
          logger.error(
            err,
            t('system.leveling.failedAssignment', { level: newLevel, user: message.author.tag, id: message.author.id, guild: message.guildId }),
          );
        });
      }

      const targetChannelId = levelingConfig.channelId || message.channelId;
      const targetChannel = message.guild.channels.cache.get(targetChannelId);

      if (targetChannel?.isTextBased()) {
        targetChannel
          .send({
            content: t('leveling.levelUp.content', { user: message.author.toString() }),
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.DarkRed)
                .setThumbnail(message.member?.displayAvatarURL() ?? message.author.displayAvatarURL())
                .setDescription(t('leveling.levelUp.body', { username: message.member?.displayName ?? message.author.displayName, level: newLevel }))
                .setFooter({ text: t('leveling.levelUp.footer', { guild: message.guild.name }), iconURL: message.guild.iconURL() ?? undefined }),
            ],
          })
          .catch((err) => {
            logger.error(err, t('system.leveling.failedMessage', { level: newLevel, user: message.author.tag, id: message.author.id, guild: message.guildId }));
          });
      }
    }
  },
});
