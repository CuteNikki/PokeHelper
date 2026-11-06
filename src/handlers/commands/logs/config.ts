import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLogs } from 'database/logs';

import { logSettings } from 'settings/logs';

import { askToReset, showSettingsPanel } from 'utility/configCommand';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('logs-config')
    .setDescription('Set up where messages, members and changes to the server are logged')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the log channels, which events are logged, and what to leave out'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the log settings of this server')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'settings':
        return showSettingsPanel(interaction, logSettings);
      case 'reset':
        return askToReset(interaction, 'logs', async () => Boolean(await getGuildLogs(interaction.guildId)));
    }
  },
});
