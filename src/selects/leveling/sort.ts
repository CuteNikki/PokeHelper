import { SelectMenu } from 'classes/base/select';
import { buildLeaderboard } from 'utility/leaderboard';
import { parseSortOrder } from 'utility/pagination';

export default new SelectMenu({
  customId: 'lb_sort',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , pageStr] = interaction.customId.split('_');
    const page = parseInt(pageStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;
    await interaction.deferUpdate();

    await buildLeaderboard({
      page,
      sortOrder: parseSortOrder(interaction.values[0]),
      guild: interaction.guild,
    }).then((response) => interaction.editReply(response));
  },
});
