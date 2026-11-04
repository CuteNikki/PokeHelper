import {
  ApplicationIntegrationType,
  channelMention,
  ChannelType,
  ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SnowflakeUtil,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { createCounting, getCounting } from 'database/counting';

import { COUNTING_CHANNEL_PERMISSIONS, countingSettings } from 'settings/counting';

import { buildConfirmation } from 'utility/confirm';
import { runCountingTask } from 'utility/counting/game';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { formatPermissions, missingBotPermissions, settingsContext } from 'utility/settings';

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
  const settings = await countingSettings.render(settingsContext(interaction), t);
  return interaction.editReply({ ...settings, components: [...(success.components ?? []), ...(settings.components ?? [])] });
}

/**
 * Handle the settings subcommand for the counting game, which shows the interactive settings panel.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the panel is shown.
 */
async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  return sendResponse(interaction, await countingSettings.render(settingsContext(interaction), t), { ephemeral: true });
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

  // The confirm button resets, whenever it's clicked
  return interaction.editReply(
    buildConfirmation('counting-reset', {
      question: t('counting.resetConfiguration.confirm'),
      confirm: t('counting.resetConfiguration.confirmButton'),
      cancel: t('counting.resetConfiguration.cancelButton'),
    }),
  );
}
