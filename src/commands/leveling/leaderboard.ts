import { ApplicationIntegrationType, Colors, EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';
import { getGuildLevelingConfiguration, getLevelFromXP, getTopUsersByXP } from 'database/leveling';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('leaderboard')
    .setDescription('Check the server leaderboard for levels and XP.')
    .addIntegerOption((option) =>
      option.setName('page').setDescription('The page number of the leaderboard to view (10 users per page)').setRequired(false).setMinValue(1),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) {
      return interaction.editReply({ content: 'The leveling system is not configured or enabled for this server!' });
    }

    const page = interaction.options.getInteger('page') || 1;
    const itemsPerPage = 10;
    const offset = (page - 1) * itemsPerPage;
    const topUsers = await getTopUsersByXP(interaction.guildId, itemsPerPage, offset);

    if (topUsers.length === 0) {
      return interaction.editReply({ content: page === 1 ? 'No users have gained XP in this server yet!' : 'No more users to display on this page!' });
    }

    const leaderboardText = topUsers
      .map((user, index) => {
        const level = getLevelFromXP(user.xp);
        return `**${index + 1 + offset}.** <@${user.userId}> — Level **${level}** (${user.xp} XP)`;
      })
      .join('\n\n');

    const embed = new EmbedBuilder().setTitle('Leveling Leaderboard').setDescription(leaderboardText).setColor(Colors.Gold);

    return interaction.editReply({ embeds: [embed] });
  },
});
