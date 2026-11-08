import { Button } from 'classes/base/button';

import { handleParticipantsButton, PARTICIPANTS_PREFIX } from 'utility/giveaways/participants';

/** The buttons of a giveaway's participants list, and the one on its post that opens it. Anyone can use them. */
export default new Button({
  customId: PARTICIPANTS_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleParticipantsButton(interaction);
  },
});
