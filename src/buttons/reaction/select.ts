import { MessageFlags, roleMention } from 'discord.js';

import { Button } from 'classes/base/button';

import { getReactionRoleMenuConfigurationByMessageId } from 'database/reaction-role';

export default new Button({
  customId: 'rr_sel',
  includesCustomId: true,
  cooldown: 1.5,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return interaction.reply({ content: 'This button can only be used in a server.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // 1. Extract and Validate Input
    const roleId = interaction.customId.split('_')[2];
    if (!roleId) {
      return interaction.editReply({ content: 'Invalid or no role ID provided!' });
    }

    // 2. Validate Database Configuration
    const menu = await getReactionRoleMenuConfigurationByMessageId(interaction.message.id);
    if (!menu) {
      return interaction.editReply({ content: 'Reaction role menu configuration not found!' });
    }

    const menuRoleIds = menu.roles.map((r) => r.roleId);
    if (!menuRoleIds.includes(roleId)) {
      return interaction.editReply({ content: 'This role is not part of the reaction role menu!' });
    }

    // 3. Required Roles Check (User must have at least one of the required roles if configured)
    if (menu.requiredRoleIds.length > 0 && !interaction.member.roles.cache.some((r) => menu.requiredRoleIds.includes(r.id))) {
      return interaction.editReply({ content: 'You do not meet the requirements to select a role from this menu!' });
    }

    // 4. State Evaluation
    const hasClickedRole = interaction.member.roles.cache.has(roleId);

    try {
      // 5. Execution Logic
      if (hasClickedRole) {
        // If they already have the role they clicked, always remove it (Toggle Off)
        await interaction.member.roles.remove(roleId);
        return interaction.editReply({
          content: `You have been removed from the role: ${roleMention(roleId)}`,
          allowedMentions: { roles: [] },
        });
      }

      if (menu.singleChoice) {
        // If it's single choice, find any other roles from this menu they currently have
        const existingMenuRoles = interaction.member.roles.cache.filter((r) => menuRoleIds.includes(r.id));

        if (existingMenuRoles.size > 0) {
          // Remove the old roles and add the new one (Swap)
          await interaction.member.roles.remove(existingMenuRoles);
          await interaction.member.roles.add(roleId);
          return interaction.editReply({
            content: `Your role has been swapped from ${existingMenuRoles.map((r) => roleMention(r.id)).join(', ')} to: ${roleMention(roleId)}`,
            allowedMentions: { roles: [] },
          });
        }
      }

      // Default behavior: just add the role
      await interaction.member.roles.add(roleId);
      return interaction.editReply({
        content: `You have been assigned the role: ${roleMention(roleId)}`,
        allowedMentions: { roles: [] },
      });
    } catch (error) {
      // 6. Graceful Error Handling (Usually hierarchy issues)
      console.error(`Failed to assign/remove role ${roleId} for ${interaction.user.tag}:`, error);
      return interaction.editReply({
        content: 'I encountered an error trying to update your roles. Please ensure my bot role is placed higher than the roles in this menu!',
      });
    }
  },
});
