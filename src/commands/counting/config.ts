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
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';
import { t } from 'i18next';

import { Command } from 'classes/base/command';

import { createCounting, getCounting, resetCounting } from 'database/counting';

import { countingSettings } from 'settings/counting';

import { runCountingTask } from 'utility/countingGame';
import { createResponse, sendResponse } from 'utility/response';

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
        ),
    )
    .addSubcommand((cmd) => cmd.setName('settings').setDescription('Change the counting game settings'))
    .addSubcommand((cmd) => cmd.setName('info').setDescription('Get information about the counting game'))
    .addSubcommand((cmd) => cmd.setName('reset').setDescription('Reset the counting game')),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'setup':
        await handleSetup(interaction);
        break;
      case 'settings':
        await handleSettings(interaction);
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

/**
 * Handle the setup subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the setup is complete.
 */
async function handleSetup(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildText]);

  const created = await runCountingTask(interaction.guildId, async () => {
    if (await getCounting(interaction.guildId)) return false;
    // Start checking from now, so the messages already in the channel are left alone
    await createCounting(interaction.guildId, {
      channelId: channel.id,
      resetOnFail: false,
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
  const settings = await countingSettings.render(interaction.guildId);
  return interaction.editReply({ ...settings, components: [...(success.components ?? []), ...(settings.components ?? [])] });
}

/**
 * Handle the settings subcommand for the counting game, which shows the interactive settings panel.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the panel is shown.
 */
async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  return sendResponse(interaction, await countingSettings.render(interaction.guildId), { ephemeral: true });
}

/**
 * Handle the info subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the info is retrieved.
 */
async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const currentCounting = await getCounting(interaction.guildId);

  if (!currentCounting) {
    return interaction.reply({ ...createResponse(t('counting.none'), 'error'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
  }

  const content = [
    t('counting.info.title'),
    '',
    t('counting.info.channel', { channel: channelMention(currentCounting.channelId) }),
    t('counting.info.resetOnFail', { state: currentCounting.resetOnFail ? t('state.enabled') : t('state.disabled') }),
    t('counting.info.allowMath', { state: currentCounting.allowMath ? t('state.enabled') : t('state.disabled') }),
    '',
    t('counting.info.lastNumber', { number: currentCounting.lastNumber ?? 0 }),
    currentCounting.lastNumberByUserId
      ? t('counting.info.lastCounter', {
          user: userMention(currentCounting.lastNumberByUserId),
        })
      : t('counting.info.noLastCounter'),
    currentCounting.lastNumberAt
      ? t('counting.info.lastCountedAt', {
          time: time(Math.floor(currentCounting.lastNumberAt.getTime() / 1000), TimestampStyles.ShortDateTime),
        })
      : t('counting.info.noLastCountedAt'),
    currentCounting.lastNumberMessageId
      ? t('counting.info.lastMessage', {
          link: `https://discord.com/channels/${interaction.guildId}/${currentCounting.channelId}/${currentCounting.lastNumberMessageId}`,
        })
      : t('counting.info.noLastMessage'),
    '',
    t('counting.info.highestNumber', { number: currentCounting.highestNumber ?? 0 }),
    currentCounting.highestNumberByUserId
      ? t('counting.info.highestCounter', {
          user: userMention(currentCounting.highestNumberByUserId),
        })
      : t('counting.info.noHighestCounter'),
    currentCounting.highestNumberAt
      ? t('counting.info.highestCountedAt', {
          time: time(Math.floor(currentCounting.highestNumberAt.getTime() / 1000), TimestampStyles.ShortDateTime),
        })
      : t('counting.info.noHighestCountedAt'),
    currentCounting.highestNumberMessageId
      ? t('counting.info.highestMessage', {
          link: `https://discord.com/channels/${interaction.guildId}/${currentCounting.channelId}/${currentCounting.highestNumberMessageId}`,
        })
      : t('counting.info.noHighestMessage'),
  ].join('\n');

  return interaction.reply({ ...createResponse(content, 'info'), allowedMentions: { parse: [] } });
}

/**
 * Handle the reset subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the reset is complete.
 */
async function handleReset(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const deleted = await runCountingTask(interaction.guildId, async () => {
    if (!(await getCounting(interaction.guildId))) return false;
    await resetCounting(interaction.guildId);
    return true;
  });

  if (!deleted) {
    return interaction.editReply(createResponse(t('counting.none'), 'error'));
  }

  return interaction.editReply(createResponse(t('counting.resetConfiguration.success'), 'warning'));
}
