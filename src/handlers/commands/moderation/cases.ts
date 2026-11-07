import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { renderCasesFor } from 'utility/moderation/cases';

/** Someone's case history on this server, which only who asked sees. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setName('cases')
    .setDescription("See someone's warns, timeouts, kicks and bans, and change or delete them")
    .addUserOption((option) => option.setName('user').setDescription('Whose cases to see. Paste their ID if they are not on the server').setRequired(true)),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    // Answered first, as Discord gives up after 3 seconds
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    return interaction.editReply(await renderCasesFor(interaction.guild, interaction.options.getUser('user', true).id, getTranslate(interaction.locale)));
  },
});
