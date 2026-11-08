import {
  ApplicationIntegrationType,
  ChannelType,
  type ChatInputCommandInteraction,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

import { Command } from 'classes/base/command';

import {
  createDraft,
  MAX_DRAFTS,
  MAX_DURATION_MINUTES,
  MAX_HOST_LENGTH,
  MAX_PRIZE_LENGTH,
  MAX_WINNERS,
  MIN_DURATION_MINUTES,
  MIN_WINNERS,
} from 'database/giveaways';

import { getGiveawaySettings } from 'settings/giveaway';

import { formatNumber } from 'utility/duration';
import { formatMinutes, parseMinutes } from 'utility/giveaways/input';
import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setName('giveaway')
    .setDescription('Give something away to your members')
    .addSubcommand((cmd) =>
      cmd
        .setName('start')
        .setDescription('Set up a giveaway. You can add who can enter and bonus entries before it starts')
        .addStringOption((option) => option.setName('prize').setDescription('What the winners get').setRequired(true).setMaxLength(MAX_PRIZE_LENGTH))
        .addStringOption((option) => option.setName('duration').setDescription('How long it runs, like 1h, 3d or 2 weeks').setRequired(true).setMaxLength(50))
        .addIntegerOption((option) => option.setName('winners').setDescription('How many win. Defaults to 1').setMinValue(MIN_WINNERS).setMaxValue(MAX_WINNERS))
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where it is posted. Defaults to this channel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option.setName('host').setDescription('Who it is from, like you, a team or a company. Defaults to you').setMaxLength(MAX_HOST_LENGTH),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    switch (interaction.options.getSubcommand()) {
      case 'start':
        return handleStart(interaction);
    }
  },
});

/** Make a draft and show its settings, where the rest is set before it's started. */
async function handleStart(interaction: ChatInputCommandInteraction<'cached'>) {
  const t = getTranslate(interaction.locale);
  // Only whoever sets it up sees the draft
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const durationMinutes = parseMinutes(interaction.options.getString('duration', true), MIN_DURATION_MINUTES, MAX_DURATION_MINUTES);
  if (durationMinutes === null) {
    return interaction.editReply(createResponse(t('giveaway.settings.duration.invalid', { max: formatMinutes(MAX_DURATION_MINUTES, t) }), 'error'));
  }

  const draft = await createDraft({
    guildId: interaction.guildId,
    channelId: interaction.options.getChannel('channel')?.id ?? interaction.channelId,
    hostId: interaction.user.id,
    host: interaction.options.getString('host')?.trim() || null,
    locale: interaction.guild.preferredLocale,
    prize: interaction.options.getString('prize', true).trim(),
    winnerCount: interaction.options.getInteger('winners') ?? MIN_WINNERS,
    durationMinutes,
  });
  if (!draft) return interaction.editReply(createResponse(t('giveaway.draft.tooMany', { max: formatNumber(MAX_DRAFTS, t) }), 'error'));

  return interaction.editReply(await getGiveawaySettings(draft.id).render(settingsContext(interaction), t));
}
