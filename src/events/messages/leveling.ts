import { Collection, Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { addXpToUser, getGuildLevelingConfiguration, getLevelFromXP } from 'database/leveling';

export default new Event({
  name: Events.MessageCreate,
  once: false,
  async execute(client, message) {
    // Ignore bot messages and non-guild messages
    if (message.author.bot || !message.inGuild()) return;

    const levelingConfig = await getGuildLevelingConfiguration(message.guildId);
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

    const userLevelingData = await addXpToUser(message.guildId, userId, xpToAdd);

    const newXp = userLevelingData.xp;
    const oldXp = newXp - xpToAdd;

    const newLevel = getLevelFromXP(newXp);
    const oldLevel = getLevelFromXP(oldXp);

    // User leveled up, check for rewards
    if (newLevel > oldLevel) {
      const rewardsToGive = levelingConfig.rewards.filter((reward) => reward.level > oldLevel && reward.level <= newLevel);

      if (rewardsToGive.length > 0) {
        const roleIdsToGive = rewardsToGive.map((reward) => reward.roleId);
        await message.member?.roles.add(roleIdsToGive).catch((err) => {
          console.error(
            t('system.leveling.failedAssignment', { level: newLevel, user: message.author.tag, id: message.author.id, guild: message.guildId }),
            err,
          );
        });
      }

      const targetChannelId = levelingConfig.channelId || message.channelId;
      const targetChannel = message.guild.channels.cache.get(targetChannelId);

      if (targetChannel?.isTextBased()) {
        targetChannel
          .send({
            content: t('leveling.levelUp', { user: message.author.tag, level: newLevel }),
          })
          .catch((err) => {
            console.error(
              t('system.leveling.failedMessage', { level: newLevel, user: message.author.tag, id: message.author.id, guild: message.guildId }),
              err,
            );
          });
      }
    }
  },
});
