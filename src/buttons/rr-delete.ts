import { MessageFlags } from 'discord.js';

import { Button } from '../classes/base/button';

import { deleteReactionRoleMenuConfiguration, getReactionRoleMenuConfiguration } from '../database/reaction-role';

export default new Button({
  customId: 'rr_del',
  includesCustomId: true,
  permissions: ['Administrator'],
  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const menuId = interaction.customId.split('_')[2]; // Extract the menu ID from the custom ID
    if (!menuId) {
      return interaction.editReply({ content: 'Invalid or no menu ID provided!' });
    }

    const menu = await getReactionRoleMenuConfiguration(menuId);
    if (!menu) {
      return interaction.editReply({ content: 'Reaction role menu not found!' });
    }

    await deleteReactionRoleMenuConfiguration(menuId);
    return interaction.editReply({ content: 'Reaction role menu deleted successfully!' });
  },
});
