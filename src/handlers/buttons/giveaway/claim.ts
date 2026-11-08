import { MessageFlags, userMention } from 'discord.js';

import { Button } from 'classes/base/button';

import { claimWin, getGiveawayById, getWin } from 'database/giveaways';

import { giveWinnerRole } from 'utility/giveaways/end';
import { GIVEAWAY_CUSTOM_ID } from 'utility/giveaways/post';
import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';

/**
 * The Claim button, for giveaways whose winners have to claim their prize: under the winners' announcement, where anyone sees it, so it
 * says so when someone who didn't win presses it, and in the winners' DMs, so they can claim it also when they can't see the channel.
 * Winners get the winner role when they claim.
 */
export default new Button({
  customId: GIVEAWAY_CUSTOM_ID.claim,
  includesCustomId: true,
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const reply = (text: string, kind: 'success' | 'error' | 'info') =>
      interaction.editReply({ ...createResponse(text, kind), allowedMentions: { parse: [] } });

    // Found by its ID alone, as in a DM there's no server to look in
    const giveaway = await getGiveawayById(interaction.customId.slice(GIVEAWAY_CUSTOM_ID.claim.length));
    // A button in a server only works for its own giveaways
    if (!giveaway || (interaction.guildId && giveaway.guildId !== interaction.guildId)) return reply(t('giveaway.join.gone'), 'error');

    if (await claimWin(giveaway.id, interaction.user.id)) {
      const guild = interaction.client.guilds.cache.get(giveaway.guildId);
      if (guild) await giveWinnerRole(guild, giveaway, [interaction.user.id]);
      return reply(t('giveaway.claim.done', { host: giveaway.host ?? userMention(giveaway.hostId) }), 'success');
    }

    // Why it couldn't be claimed
    const win = await getWin(giveaway.id, interaction.user.id);
    if (!win) return reply(t('giveaway.claim.notWinner'), 'error');
    if (win.claimedAt) return reply(t('giveaway.claim.already'), 'info');
    // Like when the announcement couldn't be posted, which leaves winners their prize without claiming it
    if (!win.claimBy && !win.replacedAt) return reply(t('giveaway.claim.notNeeded'), 'info');
    return reply(t('giveaway.claim.late'), 'error');
  },
});
