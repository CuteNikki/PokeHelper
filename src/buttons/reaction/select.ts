import { MessageFlags, roleMention } from 'discord.js';
import { t } from 'i18next';

import { Button } from 'classes/base/button';

import { getReactionRoleMenuConfigurationByMessageId } from 'database/reaction-role';

import { logger } from 'utility/logger';

export default new Button({
  customId: 'rr_sel',
  includesCustomId: true,
  cooldown: 1.5,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const roleId = interaction.customId.split('_')[2];
    if (!roleId) {
      return interaction.editReply({ content: t('reactionRole.notFound') });
    }

    const menu = await getReactionRoleMenuConfigurationByMessageId(interaction.message.id);
    if (!menu) {
      return interaction.editReply({ content: t('reactionRole.notFound') });
    }

    const menuRoleIds = menu.roles.map((r) => r.roleId);
    if (!menuRoleIds.includes(roleId)) {
      return interaction.editReply({ content: t('reactionRole.notFound') });
    }

    if (menu.requiredRoleIds.length > 0 && !interaction.member.roles.cache.some((r) => menu.requiredRoleIds.includes(r.id))) {
      return interaction.editReply({ content: t('reactionRole.select.requirements') });
    }

    const alreadyHasRole = interaction.member.roles.cache.has(roleId);

    try {
      if (alreadyHasRole) {
        await interaction.member.roles.remove(roleId);
        return interaction.editReply({
          content: t('reactionRole.select.removed', { role: roleMention(roleId) }),
          allowedMentions: { roles: [] },
        });
      }

      if (menu.singleChoice) {
        const existingMenuRoles = interaction.member.roles.cache.filter((r) => menuRoleIds.includes(r.id));

        if (existingMenuRoles.size > 0) {
          await interaction.member.roles.remove(existingMenuRoles);
          await interaction.member.roles.add(roleId);
          return interaction.editReply({
            content: t('reactionRole.select.swapped', {
              removed: existingMenuRoles.map((r) => roleMention(r.id)),
              assigned: roleMention(roleId),
            }),
            allowedMentions: { roles: [] },
          });
        }
      }

      await interaction.member.roles.add(roleId);
      return interaction.editReply({
        content: t('reactionRole.select.assigned', { role: roleMention(roleId) }),
        allowedMentions: { roles: [] },
      });
    } catch (error) {
      logger.error(error);
      return interaction.editReply({
        content: t('reactionRole.select.error'),
      });
    }
  },
});
