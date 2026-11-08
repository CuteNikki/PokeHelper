import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { renderCasesFor } from 'utility/moderation/cases';
import { permissionProblem } from 'utility/moderation/run';
import { sendError } from 'utility/response';

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
    const t = getTranslate(interaction.locale);
    // Like the buttons of the history, also when the server shows the command to others in its settings
    const problem = permissionProblem(interaction.member, 'ModerateMembers', t);
    if (problem) return sendError(interaction, problem);
    // Answered first, as Discord gives up after 3 seconds
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    return interaction.editReply(await renderCasesFor(interaction.guild, interaction.options.getUser('user', true).id, t));
  },
});
