import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildRank } from 'utility/leveling/rank';
import { sendError } from 'utility/response';

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
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
    const text = interaction.options.getBoolean('text') ?? false;

    // Checked before answering, so the error only goes to whoever asked, even when the rank would be public
    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.deferReply({ flags: ephemeral ? [MessageFlags.Ephemeral] : undefined });
    return interaction.editReply(await buildRank(interaction.guild, targetUser, { period: 'allTime', text }, t));
  },
});
