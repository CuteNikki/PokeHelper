import { Button } from 'classes/base/button';

import { handleManageButton, MANAGE_PREFIX } from 'utility/giveaways/manage';

/** The buttons of the giveaway list and of a giveaway's panel. Only who opened them sees them, but they still need to manage the server. */
export default new Button({
  customId: MANAGE_PREFIX,
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleManageButton(interaction);
  },
});
