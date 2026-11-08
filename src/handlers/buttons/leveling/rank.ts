import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildRank, parseRankCustomId, RANK_CUSTOM_ID_PREFIX } from 'utility/leveling/rank';
import { sendError } from 'utility/response';

/** The rank message's buttons, switching between all-time, weekly and monthly, and between image and text. Each carries the view it leads to. */
export default new Button({
  customId: RANK_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const parsed = parseRankCustomId(interaction.customId);
    if (!parsed) return sendError(interaction, t('system.outdated'));

    // Answered first, as Discord gives up after 3 seconds
    await interaction.deferUpdate();
    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    const user = await interaction.client.users.fetch(parsed.userId).catch(() => null);
    if (!user) return sendError(interaction, t('system.outdated'));

    await interaction.editReply(await buildRank(interaction.guild, user, parsed.view, t));
  },
});
