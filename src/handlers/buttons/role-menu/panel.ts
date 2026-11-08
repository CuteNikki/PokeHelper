import { Button } from 'classes/base/button';

import { getFeatureSwitches, setFeatureSwitch } from 'database/features';
import { getRoleMenu, getRoleMenus } from 'database/roleMenu';

import { getRoleMenuSettings, renderRoleMenuList, ROLE_MENU_CUSTOM_ID, roleMenuName } from 'settings/roleMenu';

import { buildQuestion } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendError, withNotice } from 'utility/response';
import { deleteRoleMenu, syncRoleMenuMessage } from 'utility/roleMenu';
import { settingsContext } from 'utility/settings';

/** The buttons that act on one menu, followed by its ID. */
const MENU_ACTIONS = [ROLE_MENU_CUSTOM_ID.repost, ROLE_MENU_CUSTOM_ID.delete, ROLE_MENU_CUSTOM_ID.confirmDelete, ROLE_MENU_CUSTOM_ID.back];

/** The buttons around the role menu settings. Everything they need, also to confirm deleting, is in their custom ID, so they never stop working. */
export default new Button({
  customId: 'rolemenu:',
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const { customId } = interaction;

    // Answered first, as Discord gives up after 3 seconds. None of them opens a popup
    await interaction.deferUpdate();

    if (customId === ROLE_MENU_CUSTOM_ID.list) {
      return interaction.editReply(await renderRoleMenuList(interaction.guild, t));
    }

    if (customId === ROLE_MENU_CUSTOM_ID.toggle) {
      const { roleMenusEnabled } = await getFeatureSwitches(interaction.guildId);
      await setFeatureSwitch(interaction.guildId, 'roleMenusEnabled', !roleMenusEnabled);
      // The posted menus show their buttons turned off, or on again
      for (const menu of await getRoleMenus(interaction.guildId)) await syncRoleMenuMessage(interaction.guild, menu.id);
      return interaction.editReply(await renderRoleMenuList(interaction.guild, t));
    }

    const action = MENU_ACTIONS.find((prefix) => customId.startsWith(prefix));
    if (!action) return sendError(interaction, t('system.outdated'));
    const menu = await getRoleMenu(customId.slice(action.length));
    if (menu?.guildId !== interaction.guildId) return interaction.editReply(createResponse(t('roleMenu.notFound'), 'error'));

    switch (action) {
      case ROLE_MENU_CUSTOM_ID.repost: {
        await syncRoleMenuMessage(interaction.guild, menu.id, true);
        return interaction.editReply(await getRoleMenuSettings(menu.id).render(settingsContext(interaction), t));
      }

      case ROLE_MENU_CUSTOM_ID.delete:
        return interaction.editReply(
          buildQuestion(
            {
              question: t('roleMenu.delete.question', { name: roleMenuName(menu, interaction.guild, t) }),
              confirm: t('roleMenu.delete.confirm'),
              cancel: t('roleMenu.delete.cancel'),
            },
            { confirm: `${ROLE_MENU_CUSTOM_ID.confirmDelete}${menu.id}`, cancel: `${ROLE_MENU_CUSTOM_ID.back}${menu.id}` },
          ),
        );

      case ROLE_MENU_CUSTOM_ID.confirmDelete: {
        await deleteRoleMenu(interaction.guild, menu);
        return interaction.editReply(withNotice(t('roleMenu.delete.success'), 'success', await renderRoleMenuList(interaction.guild, t)));
      }

      case ROLE_MENU_CUSTOM_ID.back:
        return interaction.editReply(await getRoleMenuSettings(menu.id).render(settingsContext(interaction), t));
    }
  },
});
