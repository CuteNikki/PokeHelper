import { SelectMenu } from 'classes/base/select';

import { handleManageSelect, MANAGE_PREFIX } from 'utility/giveaways/manage';

/** The select of the giveaway list, which opens a giveaway. */
export default new SelectMenu({
  customId: MANAGE_PREFIX,
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleManageSelect(interaction);
  },
});
