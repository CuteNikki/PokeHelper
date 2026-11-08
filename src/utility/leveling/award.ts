import { ContainerBuilder, MessageFlags, roleMention, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, userMention } from 'discord.js';
import type { GuildMember, GuildTextBasedChannel } from 'discord.js';
import { t } from 'i18next';

import { addXpToUser, getLevelFromXP } from 'database/leveling';
import { ensureUser } from 'database/user';

import type { GuildLeveling, GuildLevelingReward, LevelingMultiplier } from 'generated/prisma/client';
import { formatNumber } from 'utility/duration';
import { guildTranslate } from 'utility/i18next';
import { syncRewardRoles } from 'utility/leveling/rewards';
import { applyMultiplier, getMultiplier, type XpContext } from 'utility/leveling/rules';
import { logger } from 'utility/logger';
import { logFailure } from 'utility/response';
import { ThemeColors } from 'utility/theme';

type LevelingConfig = GuildLeveling & { rewards: GuildLevelingReward[]; multipliers: LevelingMultiplier[] };

/** The XP for a message, or a minute in voice, before multipliers. */
const MIN_XP = 15;
const MAX_XP = 25;

/**
 * Give a member XP, with the multipliers of where they earned it, and the reward roles they reached.
 * A level up is announced in the level up channel, or where they earned it without one.
 * @param channel Where they earned it: the channel they wrote in, or the voice channel they're in.
 */
export async function awardXp(member: GuildMember, config: LevelingConfig, context: XpContext, channel: GuildTextBasedChannel) {
  const baseXp = Math.floor(Math.random() * (MAX_XP - MIN_XP + 1)) + MIN_XP;
  const xpToAdd = applyMultiplier(baseXp, getMultiplier(config.multipliers, context));

  await ensureUser(member.id);
  const levelingData = await addXpToUser(member.guild.id, member.id, xpToAdd);

  const newLevel = getLevelFromXP(levelingData.xp);
  const oldLevel = getLevelFromXP(levelingData.xp - xpToAdd);

  // Checked with every XP gain, so rewards added later and roles lost by leaving and coming back are given too
  const givenRoles = await syncRewardRoles(member, config.rewards, newLevel).catch((error: unknown) => {
    logger.error(error, t('system.leveling.failedAssignment', { level: newLevel, user: member.user.tag, id: member.id, guild: member.guild.id }));
    return [];
  });

  // Rewards above are given either way, only the announcement can be turned off
  if (newLevel <= oldLevel || !config.levelUpMessages) return;

  const targetChannel = member.guild.channels.cache.get(config.levelUpChannelId ?? channel.id) ?? channel;
  if (!targetChannel.isSendable()) return;

  // Everyone in the channel sees it, so it's in the server's language
  const translate = guildTranslate(member.guild);
  const text = [translate('leveling.levelUp.body', { user: userMention(member.id), level: formatNumber(newLevel, translate) })];
  if (givenRoles.length > 0) text.push(translate('leveling.levelUp.rewards', { roles: givenRoles.map(roleMention).join(', '), count: givenRoles.length }));

  await targetChannel
    .send({
      components: [
        new ContainerBuilder()
          .setAccentColor(ThemeColors.success)
          .addSectionComponents(
            new SectionBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.join('\n')))
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(member.displayAvatarURL({ extension: 'png', size: 128 }))),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
      // Ping the member who leveled up, but not the reward roles
      allowedMentions: { users: [member.id] },
    })
    .catch(logFailure(t('system.leveling.failedMessage', { level: newLevel, user: member.user.tag, id: member.id, guild: member.guild.id })));
}
