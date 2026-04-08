import {
  ApplicationIntegrationType,
  channelMention,
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { createCounting, getCounting, resetCounting, updateCounting } from 'database/counting';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setName('counting')
    .setDescription('A fun counting game for your community!')
    .addSubcommand((cmd) =>
      cmd
        .setName('setup')
        .setDescription('Set up the counting game')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The channel that should be used for counting').addChannelTypes(ChannelType.GuildText).setRequired(true),
        )
        .addBooleanOption((option) => option.setName('reset').setDescription('Reset the current number if a wrong number was sent').setRequired(false)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('edit')
        .setDescription('Edit the counting game configuration')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The channel that should be used for counting').addChannelTypes(ChannelType.GuildText).setRequired(false),
        )
        .addBooleanOption((option) => option.setName('reset').setDescription('Reset the current number if a wrong number was sent').setRequired(false)),
    )
    .addSubcommand((cmd) => cmd.setName('info').setDescription('Get information about the counting game'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the counting game')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'setup':
        await handleSetup(interaction);
        break;
      case 'edit':
        await handleEdit(interaction);
        break;
      case 'info':
        await handleInfo(interaction);
        break;
      case 'reset':
        await handleReset(interaction);
        break;
      default:
        interaction.reply({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Red)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('### Unknown subcommand\nPlease use one of the following: `setup`, `edit`, `info`, `reset`.'),
              ),
          ],
          flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
        break;
    }
  },
});

/**
 * Handle the setup subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the setup is complete.
 */
async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentCounting = await getCounting(interaction.guildId);

  if (currentCounting) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'A counting game is already set up in this server. Please use the edit command to change the settings. Or reset the counting game if you want to start over.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);
  const resetOnFail = interaction.options.getBoolean('reset') ?? false;

  await createCounting(interaction.guildId, channel.id, resetOnFail);
  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Counting game has been set up in ${channelMention(channel.id)}!\nTo start counting, simply send the number \`1\` in the channel.`,
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

/**
 * Handle the edit subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the edit is complete.
 */
async function handleEdit(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentCounting = await getCounting(interaction.guildId);

  if (!currentCounting) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('No counting game is set up in this server. Please use the setup command to create one.'),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const channel = interaction.options.getChannel('channel', false, [ChannelType.GuildText]);
  const resetOnFail = interaction.options.getBoolean('reset');

  if (!channel && resetOnFail === undefined) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'You must provide at least one option to edit the counting game. Either a new channel or reset on fail option.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await updateCounting(interaction.guildId, {
    channelId: channel?.id ?? currentCounting.channelId,
    resetOnFail: resetOnFail ?? currentCounting.resetOnFail,
  });

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Gold)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Counting game has been updated. Use the info command to see the current settings.`)),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

/**
 * Handle the info subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the info is retrieved.
 */
async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const currentCounting = await getCounting(interaction.guildId);

  if (!currentCounting) {
    return interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('No counting game is set up in this server. Please use the setup command to create one.'),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
    });
  }

  return interaction.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Blue)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Counting Game Information\n${[
              `Counting game is set up in ${channelMention(currentCounting.channelId)}`,
              `Reset on fail: ${currentCounting.resetOnFail ? 'enabled' : 'disabled'}`,
              '',
              `Last number: ${currentCounting.lastNumber ?? 0}`,
              `Last number by: ${currentCounting.lastNumberByUserId ? userMention(currentCounting.lastNumberByUserId) : 'N/A'}`,
              `Last number at: ${currentCounting.lastNumberAt ? time(Math.floor(currentCounting.lastNumberAt.getTime() / 1000), TimestampStyles.ShortDateTime) : 'N/A'}`,
              `Last number message: ${currentCounting.lastNumberMessageId ? `[Link](<https://discord.com/channels/${interaction.guildId}/${currentCounting.channelId}/${currentCounting.lastNumberMessageId}>)` : 'N/A'}`,
              '',
              `Highest number: ${currentCounting.highestNumber ?? 0}`,
              `Highest number by: ${currentCounting.highestNumberByUserId ? userMention(currentCounting.highestNumberByUserId) : 'N/A'}`,
              `Highest number at: ${currentCounting.highestNumberAt ? time(Math.floor(currentCounting.highestNumberAt.getTime() / 1000), TimestampStyles.ShortDateTime) : 'N/A'}`,
              `Highest number message: ${currentCounting.highestNumberMessageId ? `[Link](<https://discord.com/channels/${interaction.guildId}/${currentCounting.channelId}/${currentCounting.highestNumberMessageId}>)` : 'N/A'}`,
            ].join('\n')}`,
          ),
        ),
    ],
    allowedMentions: { parse: [] },
    flags: [MessageFlags.IsComponentsV2],
  });
}

/**
 * Handle the reset subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the reset is complete.
 */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentCounting = await getCounting(interaction.guildId);

  if (!currentCounting) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('No counting game is set up in this server. Please use the setup command to create one.'),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await resetCounting(interaction.guildId);

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Gold)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('The counting game has been reset. You can set it up again using the setup command.')),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}
