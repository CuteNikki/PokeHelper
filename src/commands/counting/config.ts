import {
  ActionRowBuilder,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SnowflakeUtil,
  TextDisplayBuilder,
} from 'discord.js';
import { getTranslate } from 'utility/i18next';

import { Command } from 'classes/base/command';

import { createCounting, getCounting, resetCounting } from 'database/counting';

import { COUNTING_CHANNEL_PERMISSIONS, countingSettings } from 'settings/counting';

import { runCountingTask } from 'utility/countingGame';
import { createResponse, sendResponse } from 'utility/response';
import { formatPermissions, missingBotPermissions } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

/** How long the reset confirmation waits for an answer, in milliseconds. */
const RESET_CONFIRM_TIME = 30_000;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setName('counting-config')
    .setDescription('Set up and configure the counting game')
    .addSubcommand((cmd) =>
      cmd
        .setName('setup')
        .setDescription('Set up the counting game')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The channel that should be used for counting').addChannelTypes(ChannelType.GuildText).setRequired(true),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the counting game settings'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Remove the counting game and all its stats')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    switch (interaction.options.getSubcommand()) {
      case 'setup':
        return handleSetup(interaction);
      case 'settings':
        return handleSettings(interaction);
      case 'reset':
        return handleReset(interaction);
    }
  },
});

/**
 * Handle the setup subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the setup is complete.
 */
async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

  // The option lists the channels the user can see, which may include ones the bot can't use
  const missing = missingBotPermissions(interaction.guild, channel.id, COUNTING_CHANNEL_PERMISSIONS);
  if (missing.length > 0) {
    return interaction.editReply(
      createResponse(t('settings.channel.botPermissionsRefused', { channel: channelMention(channel.id), permissions: formatPermissions(missing, t) }), 'error'),
    );
  }

  const created = await runCountingTask(interaction.guildId, async () => {
    if (await getCounting(interaction.guildId)) return false;
    // Start checking from now, so the messages already in the channel are left alone
    await createCounting(interaction.guildId, {
      channelId: channel.id,
      maxLives: null,
      livesLeft: 0,
      regenerateLives: false,
      allowMath: false,
      lastCheckedMessageId: SnowflakeUtil.generate().toString(),
    });
    return true;
  });

  if (!created) {
    return interaction.editReply(createResponse(t('counting.setup.already'), 'error'));
  }

  // Show the settings right away, so the rest can be configured without another command
  const success = createResponse(t('counting.setup.success', { channel: channelMention(channel.id) }), 'success');
  const settings = await countingSettings.render(interaction.guild, t);
  return interaction.editReply({ ...settings, components: [...(success.components ?? []), ...(settings.components ?? [])] });
}

/**
 * Handle the settings subcommand for the counting game, which shows the interactive settings panel.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the panel is shown.
 */
async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  return sendResponse(interaction, await countingSettings.render(interaction.guild, t), { ephemeral: true });
}

/**
 * Handle the reset subcommand for the counting game, which removes it with all its stats after a confirmation.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the reset is complete or cancelled.
 */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  if (!(await getCounting(interaction.guildId))) {
    return interaction.editReply(createResponse(t('counting.none'), 'error'));
  }

  // Custom IDs include the interaction ID, so they can't be confused with another reset confirmation
  const confirmId = `counting_reset_confirm_${interaction.id}`;
  const cancelId = `counting_reset_cancel_${interaction.id}`;
  const confirmation = await interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(ThemeColors.warning)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('counting.resetConfiguration.confirm')))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(confirmId).setLabel(t('counting.resetConfiguration.confirmButton')).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(cancelId).setLabel(t('counting.resetConfiguration.cancelButton')).setStyle(ButtonStyle.Secondary),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });

  const choice = await confirmation
    .awaitMessageComponent({ componentType: ComponentType.Button, time: RESET_CONFIRM_TIME, filter: (i) => i.user.id === interaction.user.id })
    .catch(() => null);

  if (choice?.customId !== confirmId) {
    const cancelled = createResponse(t('counting.resetConfiguration.cancelled'), 'info');
    // Cancel pressed: answer that button. No answer in time: there's no button to answer, so edit the reply
    return choice ? choice.update(cancelled) : interaction.editReply(cancelled);
  }

  await choice.deferUpdate();
  await runCountingTask(interaction.guildId, async () => {
    if (await getCounting(interaction.guildId)) await resetCounting(interaction.guildId);
  });

  return interaction.editReply(createResponse(t('counting.resetConfiguration.success'), 'warning'));
}
