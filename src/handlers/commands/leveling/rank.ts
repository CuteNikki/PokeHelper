import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder, userMention } from 'discord.js';

import { Command } from 'classes/base/command';

import { getGuildLevelingConfiguration, type LevelPeriod } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildRankCard, getPeriodProgress, progressValues } from 'utility/leveling/rank';
import { createResponse, sendError } from 'utility/response';

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setName('rank')
    .setDescription('Check the level and XP in the server, all-time, this week and this month.')
    .addUserOption((option) => option.setName('user').setDescription('The user to check the rank of. Defaults to yourself.').setRequired(false))
    .addBooleanOption((option) => option.setName('ephemeral').setDescription('Whether the response should be ephemeral. Defaults to true.').setRequired(false))
    .addBooleanOption((option) =>
      option.setName('text').setDescription('Show the rank as text instead of an image, like for screen readers.').setRequired(false),
    ),
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const t = getTranslate(interaction.locale);
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
    const asText = interaction.options.getBoolean('text') ?? false;

    // Checked before answering, so the error only goes to whoever asked, even when the rank would be public
    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.deferReply({ flags: ephemeral ? [MessageFlags.Ephemeral] : undefined });

    // The card shows one period at a time with a button to switch, the text all three at once
    if (!asText) return interaction.editReply(await buildRankCard(interaction.guild, targetUser, 'allTime', t));

    const progress = (period: LevelPeriod) => getPeriodProgress(interaction.guildId, targetUser.id, period);
    const [allTime, weekly, monthly] = await Promise.all([progress('allTime'), progress('weekly'), progress('monthly')]);
    const content = [
      t('leveling.rank.text.title', { user: userMention(targetUser.id) }),
      t('leveling.rank.text.allTime', progressValues(allTime, t)),
      t('leveling.rank.text.weekly', progressValues(weekly, t)),
      t('leveling.rank.text.monthly', progressValues(monthly, t)),
    ].join('\n');
    return interaction.editReply({ ...createResponse(content, 'info'), allowedMentions: { parse: [] } });
  },
});
