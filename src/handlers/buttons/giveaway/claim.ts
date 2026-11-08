import { MessageFlags, userMention } from 'discord.js';

import { Button } from 'classes/base/button';

import { claimWin, getGiveaway, getWin } from 'database/giveaways';

import { giveWinnerRole } from 'utility/giveaways/end';
import { GIVEAWAY_CUSTOM_ID } from 'utility/giveaways/post';
import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';

/**
 * The Claim button under the winners' announcement, for giveaways whose winners have to claim their prize. Anyone sees it, so it says
 * so when someone who didn't win presses it. Winners get the winner role when they claim.
 */
export default new Button({
  customId: GIVEAWAY_CUSTOM_ID.claim,
  includesCustomId: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const reply = (text: string, kind: 'success' | 'error' | 'info') =>
      interaction.editReply({ ...createResponse(text, kind), allowedMentions: { parse: [] } });

    const giveaway = await getGiveaway(interaction.guildId, interaction.customId.slice(GIVEAWAY_CUSTOM_ID.claim.length));
    if (!giveaway) return reply(t('giveaway.join.gone'), 'error');

    if (await claimWin(giveaway.id, interaction.user.id)) {
      await giveWinnerRole(interaction.guild, giveaway, [interaction.user.id]);
      return reply(t('giveaway.claim.done', { host: giveaway.host ?? userMention(giveaway.hostId) }), 'success');
    }

    // Why it couldn't be claimed
    const win = await getWin(giveaway.id, interaction.user.id);
    if (!win) return reply(t('giveaway.claim.notWinner'), 'error');
    if (win.claimedAt) return reply(t('giveaway.claim.already'), 'info');
    return reply(t('giveaway.claim.late'), 'error');
  },
});
