import { SelectMenu } from 'classes/base/select';
import { buildLeaderboard } from 'utility/leaderboard';
import { getLeaderboardState, saveLeaderboardState } from 'utility/leaderboardState';
import { parseSortOrder } from 'utility/pagination';

export default new SelectMenu({
  customId: 'lb_sort',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await interaction.deferUpdate();

    const state = await getLeaderboardState(interaction.message.id);
    const newState = {
      messageId: interaction.message.id,
      page: state?.page ?? 1,
      sortOrder: parseSortOrder(interaction.values[0]),
      weekly: state?.weekly ?? false,
    };
    await saveLeaderboardState(newState);
    await buildLeaderboard({ ...newState, guild: interaction.guild }).then((response) => interaction.editReply(response));
  },
});
