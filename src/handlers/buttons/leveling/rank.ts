import { Button } from 'classes/base/button';

import { getGuildLevelingConfiguration } from 'database/leveling';

import { getTranslate } from 'utility/i18next';
import { buildRankCard, parseRankCustomId, RANK_CUSTOM_ID_PREFIX } from 'utility/leveling/rank';
import { sendError } from 'utility/response';

/** The rank card's button switching between all-time, weekly and monthly. It carries the user and period, so it works however old the card is. */
export default new Button({
  customId: RANK_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const parsed = parseRankCustomId(interaction.customId);
    if (!parsed) return sendError(interaction, t('system.outdated'));

    const levelingConfig = await getGuildLevelingConfiguration(interaction.guildId);
    if (!levelingConfig?.enabled) return sendError(interaction, t('leveling.disabled'));

    const user = await interaction.client.users.fetch(parsed.userId).catch(() => null);
    if (!user) return sendError(interaction, t('system.outdated'));

    await interaction.deferUpdate();
    // Replacing the card, not adding to it
    await interaction.editReply({ ...(await buildRankCard(interaction.guild, user, parsed.period, t)), attachments: [] });
  },
});
