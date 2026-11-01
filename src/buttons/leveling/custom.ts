import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildLeaderboardPageModal } from 'utility/leaderboardPageModal';
import { sendError } from 'utility/response';

/** Asks which page of the leaderboard to go to. What's submitted is handled in `utility/leaderboardPageModal`. */
export default new Button({
  customId: 'lb_custom',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , pagesStr, totalPagesStr] = interaction.customId.split('_');
    const totalPages = parseInt(totalPagesStr ?? '1', 10);
    const currentPage = parseInt(pagesStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.showModal(buildLeaderboardPageModal(currentPage, totalPages, t));
  },
});
