import {
  ApplicationIntegrationType,
  ChannelType,
  ChatInputCommandInteraction,
  Colors,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { createGuildBirthdayConfiguration, deleteGuildBirthdayConfiguration, getGuildBirthdayConfiguration } from 'database/birthday';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('birthday-announcement')
    .setDescription('Manage the birthday configuration for this server.')
    .addSubcommand((cmd) =>
      cmd
        .setName('setup')
        .setDescription('Set up the birthday configuration for this server.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to set for birthday announcements.')
            .setRequired(true)
            .addChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('edit')
        .setDescription('Edit the birthday configuration for this server.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to set for birthday announcements.')
            .setRequired(true)
            .addChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement]),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('info').setDescription('Get information about how the birthday configuration.'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Disable the birthday configuration for this server.')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

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

async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const currentConfig = await getGuildBirthdayConfiguration(interaction.guildId);

  if (currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'A birthday configuration is already set up in this server.\nPlease use the edit command to change the settings. Or reset the settings if you want to start over.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

  if (!channel || !channel.isTextBased() || !interaction.guild.channels.cache.has(channel.id)) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('The provided channel is not a text channel. Please try again.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await createGuildBirthdayConfiguration(interaction.guildId, channel.id);

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Successfully set up the birthday configuration!\nBirthday announcements will be made in ${channel}.\n\nYou can change this later using the edit command.`,
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleEdit(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const currentConfig = await getGuildBirthdayConfiguration(interaction.guildId);

  if (!currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'No birthday configuration is set up in this server yet.\nPlease use the setup command to create a configuration first.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

  if (!channel || !channel.isTextBased() || !interaction.guild.channels.cache.has(channel.id)) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('The provided channel is not a text channel. Please try again.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  if (currentConfig.channelId === channel.id) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'The provided channel is already set as the birthday announcement channel. Please provide a different channel.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await createGuildBirthdayConfiguration(interaction.guildId, channel.id);

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`Successfully updated the birthday configuration!\nBirthday announcements will now be made in ${channel}.`),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const currentConfig = await getGuildBirthdayConfiguration(interaction.guildId);

  if (!currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'No birthday configuration is set up in this server yet.\nPlease use the setup command to create a configuration first.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const channel = interaction.guild.channels.cache.get(currentConfig.channelId);

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Blue)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Birthday Configuration Info\n\n**Announcement Channel:** ${
              channel ? `${channel}` : `Channel ID: ${currentConfig.channelId} (channel not found)`
            }\n\nYou can change this using the edit command, or reset the configuration using the reset command.`,
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleReset(interaction: ChatInputCommandInteraction<'cached'>) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const currentConfig = await getGuildBirthdayConfiguration(interaction.guildId);

  if (!currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'No birthday configuration is set up in this server yet.\nThere is nothing to reset.\nPlease use the setup command to create a configuration first.',
            ),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await deleteGuildBirthdayConfiguration(interaction.guildId);

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('Successfully reset the birthday configuration!\nYou can set it up again using the setup command.'),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}
