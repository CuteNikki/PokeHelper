import { Button } from 'classes/base/button';

import { getTranslate } from 'utility/i18next';
import { openPage } from 'utility/pokedex/pageRender';
import { PAGE_BACK_PREFIX, parsePageId } from 'utility/pokedex/pages';
import { sendError } from 'utility/response';

/** The Back button of a page of the Pokédex, which goes back through the pages its message went through, one at a time. */
export default new Button({
  customId: PAGE_BACK_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const context = parsePageId(interaction.customId, PAGE_BACK_PREFIX);
    if (!context) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    return openPage(interaction, context, 'back');
  },
});
