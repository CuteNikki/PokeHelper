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

import { askToReset, showSettingsPanel } from 'utility/configCommand';
import { runCountingTask } from 'utility/counting/game';
import { formatPermissions } from 'utility/discord';
import { getTranslate } from 'utility/i18next';
import { createResponse, withNotice } from 'utility/response';
import { missingBotPermissions, settingsContext } from 'utility/settings';

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
        return showSettingsPanel(interaction, countingSettings);
      case 'reset':
        return askToReset(interaction, 'counting', async () => Boolean(await getCounting(interaction.guildId)));
    }
  },
});

/** Start the counting game in a channel. */
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
  const settings = await countingSettings.render(settingsContext(interaction), t);
  return interaction.editReply(withNotice(t('counting.setup.success', { channel: channelMention(channel.id) }), 'success', settings));
}
