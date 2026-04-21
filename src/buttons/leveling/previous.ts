import { MessageFlags } from 'discord.js';
import { t } from 'i18next';

import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { buildLeaderboard } from 'utility/leaderboard';
import { parseSortOrder } from 'utility/pagination';

export default new Button({
  customId: 'lb_prev',
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const [, , sortOrder, pageStr] = interaction.customId.split('_');
    const page = parseInt(pageStr ?? '1', 10);

    if (!interaction.inCachedGuild()) return;
    await interaction.deferUpdate();

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig || !levelingConfig.enabled) return interaction.followUp({ content: t('leveling.disabled'), flags: MessageFlags.Ephemeral });

    await buildLeaderboard({
      page: page - 1,
      sortOrder: parseSortOrder(sortOrder),
      guild: interaction.guild,
    }).then((response) => interaction.editReply(response));
  },
});
