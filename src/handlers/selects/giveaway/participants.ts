import { SelectMenu } from 'classes/base/select';

import { handleParticipantsSelect, PARTICIPANTS_PREFIX } from 'utility/giveaways/participants';

/** The select that sorts a giveaway's participants list. */
export default new SelectMenu({
  customId: PARTICIPANTS_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleParticipantsSelect(interaction);
  },
});
