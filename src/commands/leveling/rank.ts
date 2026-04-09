import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration, getLevelFromXP, getUserLevelingData, getXPForLevel } from 'database/leveling';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('rank')
    .setDescription('Check your current level and XP in the server.'),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: t('leveling.disabled') });
    }

    const userLevelingData = await getUserLevelingData(interaction.guildId, interaction.user.id);
    const xp = userLevelingData?.xp || 0;
    const level = getLevelFromXP(xp);
    const xpForNextLevel = getXPForLevel(level + 1);
    const xpForCurrentLevel = getXPForLevel(level);
    const xpIntoCurrentLevel = xp - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;

    return interaction.editReply({
      content: t('leveling.rank.state', {
        level,
        xp,
        remaining: xpIntoCurrentLevel,
        total: xpNeededForNextLevel,
      }),
    });
  },
});
