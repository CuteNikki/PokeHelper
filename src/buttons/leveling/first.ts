import { MessageFlags } from 'discord.js';
import { t } from 'i18next';

import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { buildLeaderboard } from 'utility/leaderboard';
import { getLeaderboardState, saveLeaderboardState } from 'utility/leaderboardState';

export default new Button({
  customId: 'lb_first',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferUpdate();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return interaction.followUp({ content: t('leveling.disabled'), flags: MessageFlags.Ephemeral });

    const state = await getLeaderboardState(interaction.message.id);
    const newState = {
      messageId: interaction.message.id,
      page: 1,
      sortOrder: state?.sortOrder ?? 'desc',
      weekly: state?.weekly ?? false,
    };
    await saveLeaderboardState(newState);
    await buildLeaderboard({ ...newState, guild: interaction.guild }).then((response) => interaction.editReply(response));
  },
});
