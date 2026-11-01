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

import { createCounting, getCounting, resetCounting, updateCounting } from 'database/counting';

import { runCountingTask } from 'utility/countingGame';
import { createResponse } from 'utility/response';

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
        .addBooleanOption((option) => option.setName('reset').setDescription('Reset the current number if a wrong number was sent').setRequired(false))
        .addBooleanOption((option) => option.setName('math').setDescription('Allow numbers to be sent as math, like 1+1 for 2').setRequired(false)),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('edit')
        .setDescription('Edit the counting game configuration')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The channel that should be used for counting').addChannelTypes(ChannelType.GuildText).setRequired(false),
        )
        .addBooleanOption((option) => option.setName('reset').setDescription('Reset the current number if a wrong number was sent').setRequired(false))
        .addBooleanOption((option) => option.setName('math').setDescription('Allow numbers to be sent as math, like 1+1 for 2').setRequired(false)),
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
  const resetOnFail = interaction.options.getBoolean('reset') ?? false;
  const allowMath = interaction.options.getBoolean('math') ?? false;

  const created = await runCountingTask(interaction.guildId, async () => {
    if (await getCounting(interaction.guildId)) return false;
    // Start checking from now, so the messages already in the channel are left alone
    await createCounting(interaction.guildId, { channelId: channel.id, resetOnFail, allowMath, lastCheckedMessageId: SnowflakeUtil.generate().toString() });
    return true;
  });

  if (!created) {
    return interaction.editReply(createResponse(t('counting.setup.already'), 'error'));
  }

  return interaction.editReply(createResponse(t('counting.setup.success', { channel: channelMention(channel.id) }), 'success'));
}

/**
 * Handle the edit subcommand for the counting game.
 * @param interaction {ChatInputCommandInteraction<CacheType>} The interaction object for the command.
 * @returns {Promise<unknown>} A promise that resolves when the edit is complete.
 */
async function handleEdit(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const channel = interaction.options.getChannel('channel', false, [ChannelType.GuildText]);
  const resetOnFail = interaction.options.getBoolean('reset');
  const allowMath = interaction.options.getBoolean('math');

  // getBoolean returns null, not undefined, when the option wasn't given
  if (!channel && resetOnFail === null && allowMath === null) {
    return interaction.editReply(createResponse(t('counting.edit.none'), 'error'));
  }

  const updated = await runCountingTask(interaction.guildId, async () => {
    const currentCounting = await getCounting(interaction.guildId);
    if (!currentCounting) return false;

    const channelChanged = channel !== null && channel.id !== currentCounting.channelId;
    await updateCounting(interaction.guildId, {
      ...(channel && { channelId: channel.id }),
      ...(resetOnFail !== null && { resetOnFail }),
      ...(allowMath !== null && { allowMath }),
      // In a new channel, start checking from now, so the messages already there are left alone
      ...(channelChanged && { lastCheckedMessageId: SnowflakeUtil.generate().toString() }),
    });
    return true;
  });

  if (!updated) {
    return interaction.editReply(createResponse(t('counting.none'), 'error'));
  }

  return interaction.editReply(createResponse(t('counting.edit.success'), 'warning'));
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
