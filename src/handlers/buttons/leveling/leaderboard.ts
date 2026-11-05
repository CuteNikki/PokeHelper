import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration, getLeaderboardPosition } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildLeaderboard, ITEMS_PER_PAGE } from 'utility/leveling/leaderboard';
import { buildLeaderboardPageModal } from 'utility/leveling/leaderboardPageModal';
import { LEADERBOARD_CUSTOM_ID_PREFIX, parseLeaderboardCustomId } from 'utility/leveling/leaderboardView';
import { pageOfPosition } from 'utility/pagination';
import { sendError } from 'utility/response';

/** The page buttons of the leaderboard. Each carries the view it leads to, so they work however old the message is. */
export default new Button({
  customId: LEADERBOARD_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const parsed = parseLeaderboardCustomId(interaction.customId);
    if (!parsed) return sendError(interaction, t('system.outdated'));

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    // The page button asks which page to go to in a popup, which has to be the first answer
    if (parsed.action === 'goto') return interaction.showModal(buildLeaderboardPageModal(parsed.view, t));

    // Whoever pressed it, who is whoever opened the leaderboard, as only they can use its buttons
    let view = parsed.view;
    if (parsed.action === 'me') {
      const position = await getLeaderboardPosition(interaction.guildId, interaction.user.id, view.weekly, view.sortOrder);
      if (position === null) return sendError(interaction, t('pagination.notListed'));
      view = { ...view, page: pageOfPosition(position, ITEMS_PER_PAGE) };
    }

    await interaction.deferUpdate();
    await interaction.editReply(await buildLeaderboard(view, interaction.guild, t));
  },
});
