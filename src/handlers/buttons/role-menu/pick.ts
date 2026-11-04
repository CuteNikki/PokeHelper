import { MessageFlags, roleMention } from 'discord.js';

import { Button } from 'classes/base/button';

import { getFeatureSwitches } from 'database/features';
import { getRoleMenuByMessageId } from 'database/roleMenu';

import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse } from 'utility/response';
import { ROLE_BUTTON_PREFIX } from 'utility/roleMenu';
import { canGiveRole } from 'utility/roles';

export default new Button({
  customId: ROLE_BUTTON_PREFIX,
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

    const roleId = interaction.customId.slice(ROLE_BUTTON_PREFIX.length);
    const menu = roleId ? await getRoleMenuByMessageId(interaction.message.id) : null;
    const menuRoleIds = menu?.roles.map((r) => r.roleId) ?? [];
    if (!roleId || !menu || !menuRoleIds.includes(roleId)) {
      return reply(t('roleMenu.notFound'), 'error');
    }

    // A menu that's off has its buttons disabled, but a message that couldn't be updated may still have them working
    if (!menu.enabled || !(await getFeatureSwitches(interaction.guildId)).roleMenusEnabled) {
      return reply(t('roleMenu.select.disabled'), 'error');
    }

    if (menu.requiredRoleIds.length > 0 && !interaction.member.roles.cache.some((r) => menu.requiredRoleIds.includes(r.id))) {
      return reply(t('roleMenu.select.requirements'), 'error');
    }

    // The role or the bot's own roles may have changed since the menu was set up
    if (!canGiveRole(interaction.guild, roleId)) {
      return reply(t('roleMenu.select.cantAssign', { role: roleMention(roleId) }), 'error');
    }

    const alreadyHasRole = interaction.member.roles.cache.has(roleId);

    try {
      if (alreadyHasRole) {
        await interaction.member.roles.remove(roleId);
        return reply(t('roleMenu.select.removed', { role: roleMention(roleId) }), 'success');
      }

      if (menu.singleChoice) {
        const existingMenuRoles = interaction.member.roles.cache.filter((r) => menuRoleIds.includes(r.id));

        if (existingMenuRoles.size > 0) {
          await interaction.member.roles.remove(existingMenuRoles);
          await interaction.member.roles.add(roleId);
          return reply(
            t('roleMenu.select.swapped', {
              removed: existingMenuRoles.map((r) => roleMention(r.id)).join(', '),
              assigned: roleMention(roleId),
            }),
            'success',
          );
        }
      }

      await interaction.member.roles.add(roleId);
      return reply(t('roleMenu.select.assigned', { role: roleMention(roleId) }), 'success');
    } catch (error) {
      logger.error(error, `Failed to update reaction role ${roleId} for ${interaction.user.id} in guild ${interaction.guildId}`);
      return reply(t('roleMenu.select.error'), 'error');
    }
  },
});
