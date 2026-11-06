import { SelectMenu } from 'classes/base/select';

import { getTranslate } from 'utility/i18next';
import { openPage } from 'utility/pokedex/pageRender';
import { decodePage, PAGE_LINKS_PREFIX } from 'utility/pokedex/pages';
import { sendError } from 'utility/response';

/** A select of the pages a page of the Pokédex links to. The page it's on is where Back goes from the one picked. */
export default new SelectMenu({
  customId: PAGE_LINKS_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const from = decodePage(interaction.customId.slice(PAGE_LINKS_PREFIX.length));
    const page = interaction.isStringSelectMenu() ? decodePage(interaction.values[0]) : null;
    if (!from || !page || !interaction.isStringSelectMenu()) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    return openPage(interaction, { page, back: from });
  },
});
