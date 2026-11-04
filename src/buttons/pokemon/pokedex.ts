import { Button } from 'classes/base/button';

import { getTranslate } from 'utility/i18next';
import { buildPokedexSearchModal, parsePokedexCustomId, POKEDEX_CUSTOM_ID_PREFIX, updatePokedexEntry } from 'utility/pokedex';
import { sendError } from 'utility/response';

/** The buttons of a Pokédex entry: previous, next, search, shiny and the evolutions. Each carries the entry it leads to, so they work however old the message is. */
export default new Button({
  customId: POKEDEX_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const parsed = parsePokedexCustomId(interaction.customId);
    if (!parsed) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    // The search button asks which Pokémon in a popup, which has to be the first answer
    if (parsed.action === 'search') return interaction.showModal(buildPokedexSearchModal(parsed.view, getTranslate(interaction.locale)));
    return updatePokedexEntry(interaction, parsed.slug, parsed.view);
  },
});
