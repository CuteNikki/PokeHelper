import { MessageFlags, roleMention } from 'discord.js';

import { Button } from 'classes/base/button';

import { getReactionRoleMenuConfigurationByMessageId } from 'database/reaction-role';

import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse } from 'utility/response';
import { canGiveRole } from 'utility/roles';

export default new Button({
  customId: 'rr_sel',
  includesCustomId: true,
  cooldown: 1.5,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      return;
    }

    const t = getTranslate(interaction.locale);
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    // Role mentions in the replies mustn't ping everyone who has the role
    const reply = (content: string, kind: 'success' | 'error') => interaction.editReply({ ...createResponse(content, kind), allowedMentions: { parse: [] } });

    const roleId = interaction.customId.split('_')[2];
    const menu = roleId ? await getReactionRoleMenuConfigurationByMessageId(interaction.message.id) : null;
    const menuRoleIds = menu?.roles.map((r) => r.roleId) ?? [];
    if (!roleId || !menu || !menuRoleIds.includes(roleId)) {
      return reply(t('reactionRole.notFound'), 'error');
    }

    // Turning a menu off keeps its message, but its buttons stop giving roles
    if (!menu.enabled) {
      return reply(t('reactionRole.select.disabled'), 'error');
    }

    if (menu.requiredRoleIds.length > 0 && !interaction.member.roles.cache.some((r) => menu.requiredRoleIds.includes(r.id))) {
      return reply(t('reactionRole.select.requirements'), 'error');
    }

    // The role or the bot's own roles may have changed since the menu was set up
    if (!canGiveRole(interaction.guild, roleId)) {
      return reply(t('reactionRole.select.cantAssign', { role: roleMention(roleId) }), 'error');
    }

    const alreadyHasRole = interaction.member.roles.cache.has(roleId);

    try {
      if (alreadyHasRole) {
        await interaction.member.roles.remove(roleId);
        return reply(t('reactionRole.select.removed', { role: roleMention(roleId) }), 'success');
      }

      if (menu.singleChoice) {
        const existingMenuRoles = interaction.member.roles.cache.filter((r) => menuRoleIds.includes(r.id));

        if (existingMenuRoles.size > 0) {
          await interaction.member.roles.remove(existingMenuRoles);
          await interaction.member.roles.add(roleId);
          return reply(
            t('reactionRole.select.swapped', {
              removed: existingMenuRoles.map((r) => roleMention(r.id)).join(', '),
              assigned: roleMention(roleId),
            }),
            'success',
          );
        }
      }

      await interaction.member.roles.add(roleId);
      return reply(t('reactionRole.select.assigned', { role: roleMention(roleId) }), 'success');
    } catch (error) {
      logger.error(error, `Failed to update reaction role ${roleId} for ${interaction.user.id} in guild ${interaction.guildId}`);
      return reply(t('reactionRole.select.error'), 'error');
    }
  },
});
