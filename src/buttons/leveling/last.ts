import { MessageFlags } from 'discord.js';
import { t } from 'i18next';

import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { buildLeaderboard } from 'utility/leaderboard';
import { parseSortOrder } from 'utility/pagination';

export default new Button({
  customId: 'lb_last',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , sortOrder, totalPagesStr] = interaction.customId.split('_');
    const totalPages = parseInt(totalPagesStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;
    await interaction.deferUpdate();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return interaction.followUp({ content: t('leveling.disabled'), flags: MessageFlags.Ephemeral });

    await buildLeaderboard({
      page: totalPages,
      sortOrder: parseSortOrder(sortOrder),
      guild: interaction.guild,
    }).then((response) => interaction.editReply(response));
  },
});
