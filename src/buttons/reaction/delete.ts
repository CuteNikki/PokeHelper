import { MessageFlags } from 'discord.js';

import { Button } from 'classes/base/button';

import { deleteReactionRoleMenuConfiguration, getReactionRoleMenuConfiguration } from 'database/reaction-role';

import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';

export default new Button({
  customId: 'rr_del',
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const menuId = interaction.customId.split('_')[2];
    const menu = menuId ? await getReactionRoleMenuConfiguration(menuId) : null;
    if (!menuId || !menu) {
      return interaction.editReply(createResponse(t('reactionRole.notFound'), 'error'));
    }

    await deleteReactionRoleMenuConfiguration(menuId);
    return interaction.editReply(createResponse(t('reactionRole.delete.success'), 'warning'));
  },
});
