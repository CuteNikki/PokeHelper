import { SelectMenu } from 'classes/base/select';

import { getRoleMenu } from 'database/roleMenu';

import { getRoleMenuSettings, ROLE_MENU_CUSTOM_ID } from 'settings/roleMenu';

import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

/** Opens the settings of the menu picked from the list of role menus. */
export default new SelectMenu({
  customId: ROLE_MENU_CUSTOM_ID.open,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    // Answered before anything is looked up, which can take a moment, as Discord gives up after 3 seconds
    await interaction.deferUpdate();
    const menu = await getRoleMenu(interaction.values[0] ?? '');
    if (menu?.guildId !== interaction.guildId) return interaction.editReply(createResponse(t('roleMenu.notFound'), 'error'));
    return interaction.editReply(await getRoleMenuSettings(menu.id).render(settingsContext(interaction), t));
  },
});
