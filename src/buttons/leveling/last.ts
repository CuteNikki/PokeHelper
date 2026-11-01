import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { buildLeaderboard } from 'utility/leaderboard';
import { getLeaderboardState, saveLeaderboardState } from 'utility/leaderboardState';
import { getTranslate } from 'utility/i18next';
import { sendError } from 'utility/response';

export default new Button({
  customId: 'lb_last',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , totalPagesStr] = interaction.customId.split('_');
    const totalPages = parseInt(totalPagesStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;
    await interaction.deferUpdate();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return sendError(interaction, getTranslate(interaction.locale)('leveling.disabled'));

    const state = await getLeaderboardState(interaction.message.id);
    const newState = {
      messageId: interaction.message.id,
      page: totalPages,
      sortOrder: state?.sortOrder ?? 'desc',
      weekly: state?.weekly ?? false,
      text: state?.text ?? false,
    };
    await saveLeaderboardState(newState);
    await buildLeaderboard({ ...newState, guild: interaction.guild, t: getTranslate(interaction.locale) }).then((response) => interaction.editReply(response));
  },
});
