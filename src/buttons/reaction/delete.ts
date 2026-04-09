import { MessageFlags } from 'discord.js';

import { Button } from 'classes/base/button';

import { deleteReactionRoleMenuConfiguration, getReactionRoleMenuConfiguration } from 'database/reaction-role';
import { t } from 'i18next';

export default new Button({
  customId: 'rr_del',
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const menuId = interaction.customId.split('_')[2];
    if (!menuId) {
      return interaction.editReply({ content: t('reactionRole.notFound') });
    }

    const menu = await getReactionRoleMenuConfiguration(menuId);
    if (!menu) {
      return interaction.editReply({ content: t('reactionRole.notFound') });
    }

    await deleteReactionRoleMenuConfiguration(menuId);
    return interaction.editReply({ content: t('reactionRole.delete.success') });
  },
});
