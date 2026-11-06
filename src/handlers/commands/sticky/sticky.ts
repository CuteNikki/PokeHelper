import {
  ApplicationIntegrationType,
  channelMention,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import { getSticky } from 'database/sticky';

import { getTranslate } from 'utility/i18next';
import { createResponse, sendError, sendResponse } from 'utility/response';
import { removeSticky, runStickyTask } from 'utility/sticky';
import { renderStickyList } from 'utility/stickyList';
import { buildStickyModal, stickyChannelProblem } from 'utility/stickyModal';

/** The channels a sticky message can be in: the ones messages are sent in. */
const STICKY_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
] as const;

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setName('sticky')
    .setDescription('Keep a message at the bottom of a channel')
    .addSubcommand((cmd) =>
      cmd
        .setName('set')
        .setDescription("Set a channel's sticky message, or change the one it has")
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel it stays at the bottom of. Defaults to this one')
            .addChannelTypes(...STICKY_CHANNEL_TYPES),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('remove')
        .setDescription("Remove a channel's sticky message")
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('The channel to remove it from. Defaults to this one')
            .addChannelTypes(...STICKY_CHANNEL_TYPES),
        ),
    )
    .addSubcommand((cmd) => cmd.setName('list').setDescription("See this server's sticky messages")),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'set':
        return handleSet(interaction);
      case 'remove':
        return handleRemove(interaction);
      case 'list':
        return handleList(interaction);
    }
  },
});

/** The channel picked, or the one the command was used in. Null if that's one a sticky message can't be in, like a forum. */
function pickedChannel(interaction: ChatInputCommandInteraction<'cached'>): GuildTextBasedChannel | null {
  const channel = interaction.options.getChannel('channel', false, [...STICKY_CHANNEL_TYPES]) ?? interaction.channel;
  return channel && (STICKY_CHANNEL_TYPES as readonly ChannelType[]).includes(channel.type) ? channel : null;
}

/** Open the popup to write the sticky message in, with the one the channel has if it has one. */
async function handleSet(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const channel = pickedChannel(interaction);
  if (!channel) return sendError(interaction, t('sticky.wrongChannel'));
  // Checked before writing it, so nobody writes a message that can't be posted
  const problem = stickyChannelProblem(interaction.guild, channel.id, channel.isThread(), t);
  if (problem) return sendError(interaction, problem);

  // A popup has to be the first answer, so this has to be quick
  const sticky = await getSticky(channel.id);
  return interaction.showModal(buildStickyModal(channel.id, sticky?.text, t));
}

async function handleRemove(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const channel = pickedChannel(interaction);
  if (!channel) return sendError(interaction, t('sticky.wrongChannel'));

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const removed = await runStickyTask(channel.id, () => removeSticky(channel.id, channel));
  const mention = channelMention(channel.id);
  return sendResponse(
    interaction,
    removed ? createResponse(t('sticky.remove.done', { channel: mention }), 'success') : createResponse(t('sticky.remove.none', { channel: mention }), 'info'),
  );
}

/** The server's sticky messages and the switch for all of them, which only whoever asked sees. */
async function handleList(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  return sendResponse(interaction, await renderStickyList(interaction.guild, getTranslate(interaction.locale)), { ephemeral: true });
}
