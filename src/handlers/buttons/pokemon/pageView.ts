import { Button } from 'classes/base/button';

import { getTranslate } from 'utility/i18next';
import { openPage } from 'utility/pokedex/pageRender';
import { PAGE_VIEW_PREFIX, parsePageId } from 'utility/pokedex/pages';
import { sendError } from 'utility/response';

/** A button that shows a page of the Pokédex another way, like the chart of types as text. Where Back goes stays the same. */
export default new Button({
  customId: PAGE_VIEW_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const context = parsePageId(interaction.customId, PAGE_VIEW_PREFIX);
    if (!context) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    return openPage(interaction, context, 'stay');
  },
});
