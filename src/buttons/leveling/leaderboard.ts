import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leaderboard';
import { buildLeaderboardPageModal } from 'utility/leaderboardPageModal';
import { LEADERBOARD_CUSTOM_ID_PREFIX, parseLeaderboardCustomId } from 'utility/leaderboardView';
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

    await interaction.deferUpdate();
    await interaction.editReply(await buildLeaderboard(parsed.view, interaction.guild, t));
  },
});
