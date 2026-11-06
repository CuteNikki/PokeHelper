import {
  ApplicationIntegrationType,
  channelMention,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { Command } from 'classes/base/command';

import {
  countTempVoiceCreators,
  createTempVoiceCreator,
  getTempVoiceChannel,
  getTempVoiceCreator,
  getTempVoiceCreatorByChannel,
  getTempVoiceCreators,
} from 'database/tempVoice';

import { creatorName, getTempVoiceSettings, MAX_TEMP_VOICE_CREATORS, renderTempVoiceList } from 'settings/tempVoice';

import { formatNumber } from 'utility/duration';
import { DiscordLimits } from 'utility/discordLimits';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setName('voice-config')
    .setDescription('Set up the channels to join for a voice channel of your own')
    .addSubcommand((cmd) =>
      cmd
        .setName('create')
        .setDescription('Make a voice channel one to join for a voice channel of your own')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('The voice channel people join').addChannelTypes(ChannelType.GuildVoice).setRequired(true),
        ),
    )
    .addSubcommand((cmd) =>
      cmd
        .setName('settings')
        .setDescription('Change a join channel, or see them all')
        .addStringOption((option) =>
          option.setName('channel').setDescription('The join channel to change. Leave it out to see them all').setAutocomplete(true),
        ),
    ),

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const search = interaction.options.getFocused().toLowerCase();
    const choices = (await getTempVoiceCreators(interaction.guildId))
      .map((creator) => ({ name: creatorName(creator, interaction.guild, t).slice(0, DiscordLimits.optionLabelLength), value: creator.id }))
      .filter((choice) => choice.name.toLowerCase().includes(search));
    await interaction.respond(choices.slice(0, DiscordLimits.autocompleteChoices));
  },

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'create':
        return handleCreate(interaction);
      case 'settings':
        return handleSettings(interaction);
    }
  },
});

/** Make a channel a join channel and show its settings, to pick where the new channels go. */
async function handleCreate(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const t = getTranslate(interaction.locale);
  const channel = interaction.options.getChannel('channel', true, [ChannelType.GuildVoice]);
  const error = (text: string) => sendResponse(interaction, createResponse(text, 'error'), { ephemeral: true });

  if ((await countTempVoiceCreators(interaction.guildId)) >= MAX_TEMP_VOICE_CREATORS) {
    return error(t('tempVoice.config.maximum', { max: formatNumber(MAX_TEMP_VOICE_CREATORS, t) }));
  }
  if (await getTempVoiceCreatorByChannel(channel.id)) return error(t('tempVoice.config.alreadyJoin', { channel: channelMention(channel.id) }));
  if (await getTempVoiceChannel(channel.id)) return error(t('tempVoice.config.isTemporary'));

  const creator = await createTempVoiceCreator(interaction.guildId, channel.id);
  return sendResponse(interaction, await getTempVoiceSettings(creator.id).render(settingsContext(interaction), t), { ephemeral: true });
}

/** Show the settings of a join channel, or the list of all of them to pick one from. */
async function handleSettings(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const t = getTranslate(interaction.locale);
  const creatorId = interaction.options.getString('channel');
  if (!creatorId) return sendResponse(interaction, await renderTempVoiceList(interaction.guild, t), { ephemeral: true });

  // What's typed doesn't have to be one of the suggestions
  const creator = await getTempVoiceCreator(creatorId);
  if (creator?.guildId !== interaction.guildId) {
    return sendResponse(interaction, createResponse(t('tempVoice.config.notFound'), 'error'), { ephemeral: true });
  }
  return sendResponse(interaction, await getTempVoiceSettings(creator.id).render(settingsContext(interaction), t), { ephemeral: true });
}
