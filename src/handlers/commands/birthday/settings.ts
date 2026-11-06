import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildBirthdayConfiguration } from 'database/birthday';

import { birthdaySettings } from 'settings/birthday';

import { askToReset, showSettingsPanel } from 'utility/configCommand';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('birthday-config')
    .setDescription('Set up birthday announcements and the birthday role')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the birthday announcement channel, role and more'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the birthday settings of this server')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'settings':
        return showSettingsPanel(interaction, birthdaySettings);
      case 'reset':
        return askToReset(interaction, 'birthday', async () => Boolean(await getGuildBirthdayConfiguration(interaction.guildId)));
    }
  },
});
