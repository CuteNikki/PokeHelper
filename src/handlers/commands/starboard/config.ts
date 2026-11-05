import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildStarboard } from 'database/starboard';

import { starboardSettings } from 'settings/starboard';

import { buildConfirmation } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

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
        return handleSettings(interaction);
      case 'reset':
        return handleReset(interaction);
    }
  },
});

async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  // Loading the panel can create the configuration, so defer in case that takes a moment
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  return sendResponse(interaction, await starboardSettings.render(settingsContext(interaction), t));
}

/** Remove the server's starboard settings after a confirmation. Posts already on the starboard stay. */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  if (!(await getGuildStarboard(interaction.guildId))) return interaction.editReply(createResponse(t('starboard.resetConfiguration.nothing'), 'info'));
  return interaction.editReply(
    buildConfirmation('starboard-reset', {
      question: t('starboard.resetConfiguration.confirm'),
      confirm: t('starboard.resetConfiguration.confirmButton'),
      cancel: t('starboard.resetConfiguration.cancelButton'),
    }),
  );
}
