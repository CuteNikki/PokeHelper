import { SelectMenu } from 'classes/base/select';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildLeaderboard } from 'utility/leaderboard';
import { LEADERBOARD_CUSTOM_ID_PREFIX, parseLeaderboardCustomId } from 'utility/leaderboardView';
import { parseSortOrder } from 'utility/pagination';
import { sendError } from 'utility/response';

/** Sorts the leaderboard. The select carries the rest of the view, so it works however old the message is. */
export default new SelectMenu({
  customId: `${LEADERBOARD_CUSTOM_ID_PREFIX}sort:`,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const parsed = parseLeaderboardCustomId(interaction.customId);
    if (!parsed) return sendError(interaction, t('system.outdated'));

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    await interaction.deferUpdate();
    await interaction.editReply(await buildLeaderboard({ ...parsed.view, sortOrder: parseSortOrder(interaction.values[0]) }, interaction.guild, t));
  },
});
