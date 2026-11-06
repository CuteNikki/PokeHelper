import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';

import { Button } from 'classes/base/button';

import { getFeatureSwitches, setFeatureSwitch } from 'database/features';
import { getRoleMenu, getRoleMenus } from 'database/roleMenu';

import { getRoleMenuSettings, renderRoleMenuList, ROLE_MENU_CUSTOM_ID, roleMenuName } from 'settings/roleMenu';

import { getTranslate } from 'utility/i18next';
import { createResponse, sendError, withNotice } from 'utility/response';
import { deleteRoleMenu, syncRoleMenuMessage } from 'utility/roleMenu';
import { settingsContext } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

/** The buttons that act on one menu, followed by its ID. */
const MENU_ACTIONS = [ROLE_MENU_CUSTOM_ID.repost, ROLE_MENU_CUSTOM_ID.delete, ROLE_MENU_CUSTOM_ID.confirmDelete, ROLE_MENU_CUSTOM_ID.back];

/**
 * The buttons around the role menu settings: back to the list, posting a menu again, and deleting it.
 * Everything they need is in their custom ID, so they never stop working, also the confirmation for deleting.
 */
export default new Button({
  customId: 'rolemenu:',
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const { customId } = interaction;

    if (customId === ROLE_MENU_CUSTOM_ID.list) {
      return interaction.update(await renderRoleMenuList(interaction.guild, t));
    }

    if (customId === ROLE_MENU_CUSTOM_ID.toggle) {
      // Updating every posted menu can take a moment
      await interaction.deferUpdate();
      const { roleMenusEnabled } = await getFeatureSwitches(interaction.guildId);
      await setFeatureSwitch(interaction.guildId, 'roleMenusEnabled', !roleMenusEnabled);
      // The posted menus show their buttons turned off, or on again
      for (const menu of await getRoleMenus(interaction.guildId)) await syncRoleMenuMessage(interaction.guild, menu.id);
      return interaction.editReply(await renderRoleMenuList(interaction.guild, t));
    }

    const action = MENU_ACTIONS.find((prefix) => customId.startsWith(prefix));
    if (!action) return sendError(interaction, t('system.outdated'));
    const menu = await getRoleMenu(customId.slice(action.length));
    if (menu?.guildId !== interaction.guildId) return interaction.update(createResponse(t('roleMenu.notFound'), 'error'));

    switch (action) {
      case ROLE_MENU_CUSTOM_ID.repost: {
        // Posting can take a moment, as the old message is deleted first
        await interaction.deferUpdate();
        await syncRoleMenuMessage(interaction.guild, menu.id, true);
        return interaction.editReply(await getRoleMenuSettings(menu.id).render(settingsContext(interaction), t));
      }

      case ROLE_MENU_CUSTOM_ID.delete:
        return interaction.update({
          components: [
            new ContainerBuilder()
              .setAccentColor(ThemeColors.warning)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('roleMenu.delete.question', { name: roleMenuName(menu, interaction.guild, t) })))
              .addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setCustomId(`${ROLE_MENU_CUSTOM_ID.confirmDelete}${menu.id}`)
                    .setLabel(t('roleMenu.delete.confirm'))
                    .setStyle(ButtonStyle.Danger),
                  new ButtonBuilder()
                    .setCustomId(`${ROLE_MENU_CUSTOM_ID.back}${menu.id}`)
                    .setLabel(t('roleMenu.delete.cancel'))
                    .setStyle(ButtonStyle.Secondary),
                ),
              ),
          ],
          flags: [MessageFlags.IsComponentsV2],
        });

      case ROLE_MENU_CUSTOM_ID.confirmDelete: {
        await interaction.deferUpdate();
        await deleteRoleMenu(interaction.guild, menu);
        // Back to the list, to go on with another menu
        return interaction.editReply(withNotice(t('roleMenu.delete.success'), 'success', await renderRoleMenuList(interaction.guild, t)));
      }

      case ROLE_MENU_CUSTOM_ID.back:
        return interaction.update(await getRoleMenuSettings(menu.id).render(settingsContext(interaction), t));
    }
  },
});
