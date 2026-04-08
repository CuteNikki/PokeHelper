import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  Colors,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { createUserBirthday, deleteUserBirthday, getUserBirthday, updateUserBirthday } from 'database/birthday';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('birthday')
    .setDescription('Manage your birthday and get birthday announcements.')
    .addSubcommand((cmd) =>
      cmd
        .setName('setup')
        .setDescription('Set your birthday.')
        .addStringOption((option) => option.setName('date').setDescription('Your birthday (YYYY-MM-DD)').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('timezone')
            .setDescription('Your timezone (e.g. Europe/Berlin). If not set, UTC will be used.')
            .setAutocomplete(true)
            .setRequired(true),
        )
        .addBooleanOption((option) => option.setName('show-age').setDescription('Whether to show your age when announcing your birthday.').setRequired(true))
        .addBooleanOption((option) =>
          option.setName('announce-in-guilds-by-default').setDescription('Whether to announce your birthday in guilds by default.').setRequired(false),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('edit')
        .setDescription('Edit your birthday configuration.')
        .addStringOption((option) => option.setName('date').setDescription('Your birthday (YYYY-MM-DD)').setRequired(false))
        .addStringOption((option) =>
          option
            .setName('timezone')
            .setDescription('Your timezone (e.g. Europe/Berlin). If not set, UTC will be used.')
            .setAutocomplete(true)
            .setRequired(false),
        )
        .addBooleanOption((option) => option.setName('show-age').setDescription('Whether to show your age when announcing your birthday.').setRequired(false))
        .addBooleanOption((option) =>
          option.setName('announce-in-guilds-by-default').setDescription('Whether to announce your birthday in ALL guilds by default.').setRequired(false),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('announce-in-guilds').setDescription('Manage the guilds where your birthday is announced.'))
    .addSubcommand((cmd) => cmd.setName('info').setDescription('Get information about your birthday.'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Delete your birthday from the configuration.')),

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'timezone') {
      const timezones = Intl.supportedValuesOf('timeZone');
      const filtered = timezones.filter((tz) => tz.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);
      await interaction.respond(filtered.map((tz) => ({ name: tz, value: tz })));
    }
  },

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'setup':
        await handleSetup(interaction);
        break;
      case 'edit':
        await handleEdit(interaction);
        break;
      case 'announce-in-guilds':
        await handleAnnounceInGuilds(interaction);
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

async function handleSetup(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('A birthday is already set\nUse edit to change it or reset to delete it.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateInput = interaction.options.getString('date', true);
  const timezoneInput = interaction.options.getString('timezone', true).toLowerCase();
  const showAge = interaction.options.getBoolean('show-age', true);
  const announceInGuildsByDefault = interaction.options.getBoolean('announce-in-guilds-by-default', false) ?? true;

  if (
    !Intl.supportedValuesOf('timeZone')
      .map((v) => v.toLowerCase())
      .includes(timezoneInput)
  ) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid timezone\nPlease use a valid timezone (e.g. Europe/Berlin).')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  try {
    const date = (() => {
      const dateParts = dateInput.split('-').map((part) => parseInt(part, 10));

      if (typeof dateParts[0] === 'undefined' || typeof dateParts[1] === 'undefined' || typeof dateParts[2] === 'undefined') {
        return new Date(NaN);
      }

      return new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 0, 0, 0));
    })();

    if (isNaN(date.getTime())) {
      return interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(Colors.Red)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid date format\nPlease YYYY-MM-DD.')),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    await createUserBirthday(interaction.user.id, date, timezoneInput, showAge, announceInGuildsByDefault);
  } catch (error) {
    console.error('Error creating birthday configuration:', error);
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('There was an error setting your birthday. Please try again later.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Your birthday has been set successfully! 🎉')),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleEdit(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('No birthday is set\nUse setup to create one.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateInput = interaction.options.getString('date', false);
  const timezoneInput = interaction.options.getString('timezone', false)?.toLowerCase();
  const showAge = interaction.options.getBoolean('show-age', false);
  const announceInGuildsByDefault = interaction.options.getBoolean('announce-in-guilds-by-default', false);

  if (!dateInput && !timezoneInput && showAge === null && announceInGuildsByDefault === null) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('No changes provided\nPlease provide at least one option to change.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  if (timezoneInput) {
    if (
      !Intl.supportedValuesOf('timeZone')
        .map((v) => v.toLowerCase())
        .includes(timezoneInput)
    ) {
      return interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(Colors.Red)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid timezone\nPlease use a valid timezone (e.g. Europe/Berlin).')),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  }

  let date: Date | undefined;
  if (dateInput) {
    const dateParts = dateInput.split('-').map((part) => parseInt(part, 10));

    if (typeof dateParts[0] === 'undefined' || typeof dateParts[1] === 'undefined' || typeof dateParts[2] === 'undefined') {
      return interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(Colors.Red)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid date format\nPlease use YYYY-MM-DD.')),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    date = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 0, 0, 0));

    if (isNaN(date.getTime())) {
      return interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(Colors.Red)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('Invalid date format\nPlease use YYYY-MM-DD.')),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  }

  try {
    await updateUserBirthday(interaction.user.id, {
      date: date ?? currentConfig.date,
      timezone: timezoneInput ?? currentConfig.timezone,
      showAge: showAge ?? currentConfig.showAge,
      announceInGuildsByDefault: announceInGuildsByDefault ?? currentConfig.announceInGuildsByDefault,
    });
  } catch (error) {
    console.error('Error updating birthday configuration:', error);
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Red)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('There was an error updating your birthday. Please try again later.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Your birthday has been updated successfully! 🎉')),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });

  return interaction;
}

async function handleAnnounceInGuilds(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (currentConfig?.announceInGuildsByDefault) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('Your birthday is set to be announced in all guilds by default.\nYou cannot manage specific guilds.'),
          ),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const mutualGuilds = interaction.client.guilds.cache.filter((g) => g.members.cache.has(interaction.user.id));

  // Add a placeholder option to allow deselecting all guilds
  const guildOptions = [
    {
      label: 'No guilds selected',
      value: 'none',
      default: currentConfig?.announceInGuildIds.length === 0,
      description: 'Select this to announce in no guilds',
    },
    ...mutualGuilds
      .map((g) => ({
        label: g.name,
        value: g.id,
        default: currentConfig?.announceInGuildIds.includes(g.id) ?? false,
      }))
      .slice(0, 24),
  ];

  const message = await interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Yellow)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `This feature is not yet implemented.\nYou are in ${mutualGuilds.size} mutual guild(s) with the bot.\nThis feature will be available in a future update.`,
          ),
        )
        .addActionRowComponents(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId('birthday-announce-in-guilds-select').setPlaceholder('Manage guilds...').setOptions(guildOptions),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });

  const collector = message.createMessageComponentCollector({ time: 5 * 60 * 1000 });

  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      return i.reply({ content: 'This is not your interaction.', flags: MessageFlags.Ephemeral });
    }

    if (i.customId === 'birthday-announce-in-guilds-select' && i.isStringSelectMenu()) {
      let selectedGuildIds = i.values;

      // If placeholder is selected, treat as empty selection
      if (selectedGuildIds.includes('none')) {
        selectedGuildIds = [];
      } else {
        // Remove placeholder if accidentally selected with others
        selectedGuildIds = selectedGuildIds.filter((id) => id !== 'none');
      }

      try {
        await updateUserBirthday(interaction.user.id, { announceInGuildIds: selectedGuildIds });
      } catch (error) {
        console.error('Error updating announceInGuildIds:', error);
        return i.update({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Red)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent('There was an error updating your guilds. Please try again later.')),
          ],
          flags: [MessageFlags.IsComponentsV2],
        });
      }

      return i.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(Colors.Green)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('Your guild announcement settings have been updated successfully! 🎉'))
            .addActionRowComponents(
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId('birthday-announce-in-guilds-select')
                  .setPlaceholder('Manage guilds...')
                  .setOptions(
                    guildOptions.map((option) => ({
                      ...option,
                      default: selectedGuildIds.includes(option.value),
                    })),
                  ),
              ),
            ),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }
  });

  collector.on('end', async () => {
    if (message.editable) {
      await message.edit({
        components: message.components
          .filter((row) => row.type === 1)
          .map((row) =>
            ActionRowBuilder.from(row)
              .setComponents(
                ...row.components.map((component) => {
                  if (component.type === 3) {
                    // StringSelectMenu
                    return StringSelectMenuBuilder.from(component).setDisabled(true);
                  }
                  // Convert other component types to their respective builders if needed
                  if ('toBuilder' in component && typeof component.toBuilder === 'function') {
                    return component.toBuilder();
                  }
                  return component;
                }),
              )
              .toJSON(),
          ),
      });
    }
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('No birthday is set\nUse setup to create one.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };

  if (currentConfig.date.getUTCFullYear() !== new Date().getUTCFullYear()) {
    dateOptions.year = 'numeric';
  }

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### Your Birthday Information\n- **Date:** ${currentConfig.date.toLocaleDateString('en-US', dateOptions)}\n- **Timezone:** ${
              currentConfig.timezone
            }\n- **Show Age:** ${currentConfig.showAge ? 'Yes' : 'No'}\n- **Announce in Guilds by Default:** ${currentConfig.announceInGuildsByDefault ? 'Yes' : 'No'}\n- **Announce in Specific Guilds:** ${
              currentConfig.announceInGuildIds.length > 0 ? currentConfig.announceInGuildIds.join(', ') : 'None'
            }`,
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleReset(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(Colors.Yellow)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('No birthday is set\nUse setup to create one.')),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await deleteUserBirthday(interaction.user.id);

  return interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(Colors.Green)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Your birthday has been deleted successfully.')),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}
