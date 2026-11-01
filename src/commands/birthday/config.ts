import {
  ApplicationIntegrationType,
  ChatInputCommandInteraction,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { createUserBirthday, deleteUserBirthday, getUserBirthday, updateUserBirthday } from 'database/birthday';

import { parseBirthday, resolveTimezone } from 'utility/birthdayDates';
import { buildAnnounceInGuildsPicker } from 'utility/birthdayGuilds';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { ThemeColors } from 'utility/theme';

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
        await handleSetup(interaction, getTranslate(interaction.locale));
        break;
      case 'edit':
        await handleEdit(interaction, getTranslate(interaction.locale));
        break;
      case 'announce-in-guilds':
        await handleAnnounceInGuilds(interaction, getTranslate(interaction.locale));
        break;
      case 'info':
        await handleInfo(interaction, getTranslate(interaction.locale));
        break;
      case 'reset':
        await handleReset(interaction, getTranslate(interaction.locale));
        break;
      default:
        return;
    }
  },
});

async function handleSetup(interaction: ChatInputCommandInteraction, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (currentConfig) {
    return interaction.editReply({
      components: [
        new ContainerBuilder().setAccentColor(ThemeColors.error).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.already'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateInput = interaction.options.getString('date', true);
  const timezone = resolveTimezone(interaction.options.getString('timezone', true));
  const showAge = interaction.options.getBoolean('show-age', true);
  const announceInGuildsByDefault = interaction.options.getBoolean('announce-in-guilds-by-default', false) ?? true;

  if (!timezone) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(ThemeColors.error)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidTimezone'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  try {
    const date = parseBirthday(dateInput, new Date());
    if (!date) {
      return interaction.editReply({
        components: [
          new ContainerBuilder()
            .setAccentColor(ThemeColors.error)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidDate'))),
        ],
        flags: [MessageFlags.IsComponentsV2],
      });
    }

    await createUserBirthday(interaction.user.id, date, timezone, showAge, announceInGuildsByDefault);
  } catch (error) {
    logger.error(error, 'Error creating birthday configuration:');
    return interaction.editReply({
      components: [
        new ContainerBuilder().setAccentColor(ThemeColors.error).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.error'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  return interaction.editReply({
    components: [
      new ContainerBuilder().setAccentColor(ThemeColors.success).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.success'))),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleEdit(interaction: ChatInputCommandInteraction, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.none')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateInput = interaction.options.getString('date', false);
  const timezoneInput = interaction.options.getString('timezone', false);
  const showAge = interaction.options.getBoolean('show-age', false);
  const announceInGuildsByDefault = interaction.options.getBoolean('announce-in-guilds-by-default', false);

  if (!dateInput && !timezoneInput && showAge === null && announceInGuildsByDefault === null) {
    return interaction.editReply({
      components: [
        new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.edit.none'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const timezone = timezoneInput ? resolveTimezone(timezoneInput) : null;
  if (timezoneInput && !timezone) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(ThemeColors.error)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidTimezone'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const date = dateInput ? parseBirthday(dateInput, new Date()) : null;
  if (dateInput && !date) {
    return interaction.editReply({
      components: [
        new ContainerBuilder().setAccentColor(ThemeColors.error).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.setup.invalidDate'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  try {
    await updateUserBirthday(interaction.user.id, {
      date: date ?? currentConfig.date,
      timezone: timezone ?? currentConfig.timezone,
      showAge: showAge ?? currentConfig.showAge,
      announceInGuildsByDefault: announceInGuildsByDefault ?? currentConfig.announceInGuildsByDefault,
    });
  } catch (error) {
    logger.error(error, 'Error updating birthday configuration:');
    return interaction.editReply({
      components: [
        new ContainerBuilder().setAccentColor(ThemeColors.error).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.edit.error'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await interaction.editReply({
    components: [
      new ContainerBuilder().setAccentColor(ThemeColors.success).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.edit.success'))),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });

  return interaction;
}

async function handleAnnounceInGuilds(interaction: ChatInputCommandInteraction, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (currentConfig?.announceInGuildsByDefault) {
    return interaction.editReply({
      components: [
        new ContainerBuilder()
          .setAccentColor(ThemeColors.info)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.announceInGuild.all'))),
      ],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  return interaction.editReply(buildAnnounceInGuildsPicker(interaction.client, interaction.user.id, currentConfig?.announceInGuildIds ?? [], t));
}

async function handleInfo(interaction: ChatInputCommandInteraction, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.none')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  const dateOptions: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };

  if (currentConfig.date.getUTCFullYear() !== new Date().getUTCFullYear()) {
    dateOptions.year = 'numeric';
  }

  return interaction.editReply({
    components: [
      new ContainerBuilder().setAccentColor(ThemeColors.success).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            t('birthday.info.title'),
            // The birthday is stored at midnight UTC, so it's shown in UTC to not slip to the day before
            t('birthday.info.date', { date: currentConfig.date.toLocaleDateString(t('locale'), { ...dateOptions, timeZone: 'UTC' }) }),
            // Birthdays from before timezones kept their case are stored in lowercase
            t('birthday.info.timezone', { timezone: currentConfig.timezone ? (resolveTimezone(currentConfig.timezone) ?? currentConfig.timezone) : 'UTC' }),
            t('birthday.info.showAge', { state: currentConfig.showAge ? t('state.yes') : t('state.no') }),
            t('birthday.info.announceInGuilds', { state: currentConfig.announceInGuildsByDefault ? t('state.yes') : t('state.no') }),
            currentConfig.announceInGuildIds.length > 0
              ? t('birthday.info.announceInSpecificGuilds', {
                  guilds: currentConfig.announceInGuildIds
                    .map((guildId) => t('birthday.info.guildEntry', { guild: interaction.client.guilds.cache.get(guildId)?.name ?? guildId }))
                    .join('\n'),
                })
              : t('birthday.info.announceInSpecificGuildsNone'),
          ].join('\n'),
        ),
      ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}

async function handleReset(interaction: ChatInputCommandInteraction, t: Translate) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const currentConfig = await getUserBirthday(interaction.user.id);

  if (!currentConfig) {
    return interaction.editReply({
      components: [new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.none')))],
      flags: [MessageFlags.IsComponentsV2],
    });
  }

  await deleteUserBirthday(interaction.user.id);

  return interaction.editReply({
    components: [
      new ContainerBuilder().setAccentColor(ThemeColors.success).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('birthday.reset.success'))),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });
}
