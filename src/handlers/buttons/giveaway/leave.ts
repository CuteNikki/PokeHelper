import { Button } from 'classes/base/button';

import { getGiveaway, leaveGiveaway } from 'database/giveaways';

import { isRunning } from 'utility/giveaways/entry';
import { GIVEAWAY_CUSTOM_ID } from 'utility/giveaways/post';
import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';

/** The Leave button on the private answer to Join, for someone who doesn't want to be in a giveaway anymore. */
export default new Button({
  customId: GIVEAWAY_CUSTOM_ID.leave,
  includesCustomId: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    // Replaces the answer it's on, which only they see
    await interaction.deferUpdate();

    const giveaway = await getGiveaway(interaction.guildId, interaction.customId.slice(GIVEAWAY_CUSTOM_ID.leave.length));
    if (!giveaway) return interaction.editReply(createResponse(t('giveaway.join.gone'), 'error'));
    // Once it ended, the winners were drawn from who was in, so leaving wouldn't change anything
    if (!isRunning(giveaway)) return interaction.editReply(createResponse(t('giveaway.join.ended'), 'error'));

    const left = await leaveGiveaway(giveaway.id, interaction.user.id);
    return interaction.editReply(createResponse(t(left ? 'giveaway.join.left' : 'giveaway.join.notIn'), left ? 'success' : 'info'));
  },
});
