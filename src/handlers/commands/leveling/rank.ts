import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, userMention } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration, getLevelFromXP, getUserLevelingData, getUserRank, getXPForLevel, type LevelPeriod } from 'database/leveling';

import { loadAvatar } from 'utility/canvas';
import { formatNumber } from 'utility/duration';
import { getTranslate, type Translate } from 'utility/i18next';
import { renderRankCard, type LevelProgress } from 'utility/leveling/rankCard';
import { createResponse, imageWithDescription, sendError } from 'utility/response';

/** A member's level progress from their XP and rank. */
function getProgress(xp: number, rank: number): LevelProgress & { xp: number } {
  const level = getLevelFromXP(xp);
  const currentLevelXP = getXPForLevel(level);
  return { xp, level, rank, xpIntoLevel: xp - currentLevelXP, xpRequired: getXPForLevel(level + 1) - currentLevelXP };
}

/** The values of a progress line, formatted for the language. */
function progressValues(progress: LevelProgress & { xp: number }, t: Translate) {
  return {
    level: formatNumber(progress.level, t),
    rank: formatNumber(progress.rank, t),
    xpIntoLevel: formatNumber(progress.xpIntoLevel, t),
    xpRequired: formatNumber(progress.xpRequired, t),
    xp: formatNumber(progress.xp, t),
  };
}

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('rank')
    .setDescription('Check the level and XP in the server, all-time, this week and this month.')
    .addUserOption((option) => option.setName('user').setDescription('The user to check the rank of. Defaults to yourself.').setRequired(false))
    .addBooleanOption((option) => option.setName('ephemeral').setDescription('Whether the response should be ephemeral. Defaults to true.').setRequired(false))
    .addBooleanOption((option) =>
      option.setName('text').setDescription('Show the rank as text instead of an image, like for screen readers.').setRequired(false),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const t = getTranslate(interaction.locale);
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const targetMember = interaction.guild.members.cache.get(targetUser.id);
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
    const asText = interaction.options.getBoolean('text') ?? false;

    // Checked before answering, so the error only goes to whoever asked, even when the rank would be public
    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.deferReply({ flags: ephemeral ? [MessageFlags.Ephemeral] : undefined });

    // The same place as on the leaderboard, where ties are ordered too
    const periodProgress = async (period: LevelPeriod) => {
      const [data, rank] = await Promise.all([
        getUserLevelingData(interaction.guildId, targetUser.id, period),
        getUserRank(interaction.guildId, targetUser.id, period),
      ]);
      return getProgress(data?.xp ?? 0, rank);
    };
    const [allTime, weekly, monthly] = await Promise.all([periodProgress('allTime'), periodProgress('weekly'), periodProgress('monthly')]);
    const displayName = targetMember?.displayName || targetUser.displayName || targetUser.username;

    const allTimeValues = progressValues(allTime, t);
    const weeklyValues = progressValues(weekly, t);

    if (asText) {
      const content = [
        t('leveling.rank.text.title', { user: userMention(targetUser.id) }),
        t('leveling.rank.text.allTime', allTimeValues),
        t('leveling.rank.text.weekly', weeklyValues),
        // Only here, the card stays with all-time and weekly
        t('leveling.rank.text.monthly', progressValues(monthly, t)),
      ].join('\n');
      return interaction.editReply({ ...createResponse(content, 'info'), allowedMentions: { parse: [] } });
    }

    const avatar = await loadAvatar(targetUser.displayAvatarURL({ extension: 'png', size: 256 }));
    const image = renderRankCard({ displayName, username: targetUser.username, avatar, allTime, weekly }, t);

    const description = t('leveling.rank.altText', {
      user: displayName,
      allTime: t('leveling.rank.text.allTimePlain', allTimeValues),
      weekly: t('leveling.rank.text.weeklyPlain', weeklyValues),
    });

    const { gallery, file } = imageWithDescription('rank-card.png', image, description);
    return interaction.editReply({
      components: [gallery],
      files: [file],
      flags: [MessageFlags.IsComponentsV2],
      allowedMentions: { parse: [] },
    });
  },
});
