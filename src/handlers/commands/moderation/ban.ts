import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { Command } from 'classes/base/command';

import { DAY, HOUR } from 'utility/duration';
import { MAX_REASON_LENGTH, runModeration } from 'utility/moderation/run';

/** A ban, for good or for a while, which also works on people who aren't on the server, like by pasting their ID. */
export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setName('ban')
    .setDescription("Ban someone from the server, also if they're not on it")
    .addUserOption((option) => option.setName('user').setDescription('Who to ban. Paste their ID if they are not on the server').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why they get banned').setMaxLength(MAX_REASON_LENGTH))
    .addStringOption((option) =>
      option.setName('duration').setDescription('How long, like 3d or 2w, after which it is lifted. Defaults to for good').setMaxLength(50),
    )
    .addIntegerOption((option) =>
      option
        .setName('delete-messages')
        .setDescription('Delete their messages from a while back. Defaults to none')
        .addChoices(
          { name: "Don't delete any", value: 0 },
          { name: 'From the last hour', value: HOUR / 1000 },
          { name: 'From the last day', value: DAY / 1000 },
          { name: 'From the last 7 days', value: (7 * DAY) / 1000 },
        ),
    )
    .addBooleanOption((option) => option.setName('dm').setDescription('Whether to tell them by DM. Defaults to yes')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    return runModeration(interaction, {
      type: 'ban',
      user: interaction.options.getUser('user', true),
      reason: interaction.options.getString('reason'),
      duration: interaction.options.getString('duration'),
      deleteMessageSeconds: interaction.options.getInteger('delete-messages') ?? 0,
      dm: interaction.options.getBoolean('dm') ?? true,
    });
  },
});
