import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { levelingSettings } from 'settings/leveling';

import { askToReset, showSettingsPanel } from 'utility/configCommand';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('leveling-config')
    .setDescription('Set up and configure leveling')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the leveling settings, rewards and multipliers'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the leveling settings, rewards and multipliers')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'settings':
        return showSettingsPanel(interaction, levelingSettings);
      case 'reset':
        return askToReset(interaction, 'leveling', async () => Boolean(await getGuildLevelingConfiguration(interaction.guildId)));
    }
  },
});
