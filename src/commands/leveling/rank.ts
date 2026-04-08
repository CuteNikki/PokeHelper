import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

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
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: 'The leveling system is not configured or enabled for this server!' });
    }

    const userLevelingData = await getUserLevelingData(interaction.guildId, interaction.user.id);
    const xp = userLevelingData?.xp || 0;
    const level = getLevelFromXP(xp);
    const xpForNextLevel = getXPForLevel(level + 1);
    const xpForCurrentLevel = getXPForLevel(level);
    const xpIntoCurrentLevel = xp - xpForCurrentLevel;
    const xpNeededForNextLevel = xpForNextLevel - xpForCurrentLevel;

    return interaction.editReply({
      content: `You are currently level ${level} with ${xp} XP.\nYou need ${xpIntoCurrentLevel}/${xpNeededForNextLevel} XP to reach the next level.`,
    });
  },
});
