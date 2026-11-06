import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildStarboard } from 'database/starboard';

import { starboardSettings } from 'settings/starboard';

import { askToReset, showSettingsPanel } from 'utility/configCommand';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('starboard-config')
    .setDescription('Set up the starboard, where messages with enough reactions are posted')
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the starboard channel, its emoji, how many reactions it takes and more'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the starboard settings of this server')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'settings':
        return showSettingsPanel(interaction, starboardSettings);
      case 'reset':
        return askToReset(interaction, 'starboard', async () => Boolean(await getGuildStarboard(interaction.guildId)));
    }
  },
});
