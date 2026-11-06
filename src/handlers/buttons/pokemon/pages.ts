import { Button } from 'classes/base/button';

import { getTranslate } from 'utility/i18next';
import { openPage } from 'utility/pokedex/pageRender';
import { PAGE_BUTTON_PREFIX, parsePageId } from 'utility/pokedex/pages';
import { sendError } from 'utility/response';

/** A button to a page of the Pokédex, like Back or Where to find. Anyone can press it, as only its owner's message changes. */
export default new Button({
  customId: PAGE_BUTTON_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const context = parsePageId(interaction.customId, PAGE_BUTTON_PREFIX);
    if (!context) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    return openPage(interaction, context, 'forward');
  },
});
