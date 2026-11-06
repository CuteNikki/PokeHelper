import { SelectMenu } from 'classes/base/select';

import { getTranslate } from 'utility/i18next';
import { openPage } from 'utility/pokedex/pageRender';
import { PAGE_GAME_PREFIX, parsePageId } from 'utility/pokedex/pages';
import { sendError } from 'utility/response';

/** The select of games on a page of the Pokédex, like where a Pokémon is found. Keeps the page's Back button. */
export default new SelectMenu({
  customId: PAGE_GAME_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const context = parsePageId(interaction.customId, PAGE_GAME_PREFIX);
    const game = interaction.isStringSelectMenu() ? interaction.values[0] : undefined;
    if (!context || !game || !interaction.isStringSelectMenu()) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    return openPage(interaction, { page: { ...context.page, game }, back: context.back }, 'stay');
  },
});
