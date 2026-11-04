import { Button } from 'classes/base/button';

import { getTranslate } from 'utility/i18next';
import { parsePokedexCustomId, POKEDEX_CUSTOM_ID_PREFIX, updatePokedexEntry } from 'utility/pokedex';
import { sendError } from 'utility/response';

/** The previous, next and shiny buttons of a Pokédex entry. Each carries the entry it leads to, so they work however old the message is. */
export default new Button({
  customId: POKEDEX_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const parsed = parsePokedexCustomId(interaction.customId);
    if (!parsed) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    return updatePokedexEntry(interaction, parsed.slug, parsed.shiny);
  },
});
