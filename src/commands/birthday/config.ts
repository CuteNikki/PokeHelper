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
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { createUserBirthday, deleteUserBirthday, getUserBirthday, updateUserBirthday } from 'database/birthday';

import { logger } from 'utility/logger';

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
        return;
    }
  },
});

async function handleSetup(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.already'))),
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
        new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidTimezone'))),
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
          new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidDate'))),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    await createUserBirthday(interaction.user.id, date, timezoneInput, showAge, announceInGuildsByDefault);
  } catch (error) {
    logger.error(error, 'Error creating birthday configuration:');
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.error')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  return interaction.editReply({
    components: [
      new ContainerBuilder().setAccentColor(Colors.Green).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.success'))),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleEdit(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(Colors.Yellow).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.none')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateInput = interaction.options.getString('date', false);
  const timezoneInput = interaction.options.getString('timezone', false)?.toLowerCase();
  const showAge = interaction.options.getBoolean('show-age', false);
  const announceInGuildsByDefault = interaction.options.getBoolean('announce-in-guilds-by-default', false);

  if (!dateInput && !timezoneInput && showAge === null && announceInGuildsByDefault === null) {
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(Colors.Yellow).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.edit.none')))],
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
          new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidTimezone'))),
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
          new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidDate'))),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    date = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 0, 0, 0));

    if (isNaN(date.getTime())) {
      return interaction.editReply({
        components: [
          new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidDate'))),
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
    logger.error(error, 'Error updating birthday configuration:');
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.edit.error')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await interaction.editReply({
    components: [new ContainerBuilder().setAccentColor(Colors.Green).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.edit.success')))],
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
        new ContainerBuilder().setAccentColor(Colors.Yellow).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.all'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const mutualGuilds = interaction.client.guilds.cache.filter((g) => g.members.cache.has(interaction.user.id));

  // Add a placeholder option to allow deselecting all guilds
  const guildOptions = [
    {
      label: t('birthday.announceInGuild.noneLabel'),
      value: 'none',
      default: currentConfig?.announceInGuildIds.length === 0,
      description: t('birthday.announceInGuild.noneDescription'),
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.selectDescription')))
        .addActionRowComponents(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('birthday-announce-in-guilds-select')
              .setPlaceholder(t('birthday.announceInGuild.selectPlaceholder'))
              .setOptions(guildOptions),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });

  const collector = message.createMessageComponentCollector({ time: 5 * 60 * 1000 });

  collector.on('collect', (i) => {
    void (async () => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: t('birthday.announceInGuild.selectFilter'), flags: MessageFlags.Ephemeral });
      }

      if (i.customId === 'birthday-announce-in-guilds-select' && i.isStringSelectMenu()) {
        let selectedGuildIds = i.values;

        // If placeholder is selected, treat as empty selection
        if (selectedGuildIds.includes('none')) {
          selectedGuildIds = [];
        }

        try {
          await updateUserBirthday(interaction.user.id, { announceInGuildIds: selectedGuildIds });
        } catch (error) {
          logger.error(error, 'Error updating announceInGuildIds:');
          return i.update({
            components: [
              new ContainerBuilder()
                .setAccentColor(Colors.Red)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.error'))),
            ],
            flags: [MessageFlags.IsComponentsV2],
          });
        }

        return i.update({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Green)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.success')))
              .addActionRowComponents(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                  new StringSelectMenuBuilder()
                    .setCustomId('birthday-announce-in-guilds-select')
                    .setPlaceholder(t('birthday.announceInGuild.selectPlaceholder'))
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
    })();
  });

  collector.on('end', () => {
    void (async () => {
      if (message.editable) {
        await message.edit({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Yellow)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.selectDescription')))
              .addActionRowComponents(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                  new StringSelectMenuBuilder()
                    .setCustomId('birthday-announce-in-guilds-select')
                    .setPlaceholder(t('birthday.announceInGuild.selectPlaceholder'))
                    .setOptions(guildOptions)
                    .setDisabled(true),
                ),
              ),
          ],
          flags: [MessageFlags.IsComponentsV2],
        });
      }
    })();
  });
}

async function handleInfo(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(Colors.Yellow).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.none')))],
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
            [
              t('birthday.info.title'),
              t('birthday.info.date', { date: currentConfig.date.toLocaleDateString('en-US', dateOptions) }),
              t('birthday.info.timezone', { timezone: currentConfig.timezone }),
              t('birthday.info.showAge', { showAge: currentConfig.showAge ? t('state.yes') : t('state.no') }),
              t('birthday.info.announceInGuilds', { announceInGuilds: currentConfig.announceInGuildsByDefault ? t('state.yes') : t('state.no') }),
              currentConfig.announceInGuildIds.length > 0
                ? t('birthday.info.announceInSpecificGuilds', { guilds: currentConfig.announceInGuildIds.join(', ') })
                : t('birthday.info.announceInSpecificGuildsNone'),
            ].join('\n'),
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
      components: [new ContainerBuilder().setAccentColor(Colors.Yellow).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.none')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await deleteUserBirthday(interaction.user.id);

  return interaction.editReply({
    components: [
      new ContainerBuilder().setAccentColor(Colors.Green).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.reset.success'))),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}
