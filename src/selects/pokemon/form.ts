import type { StringSelectMenuInteraction } from 'discord.js';

import { SelectMenu } from 'classes/base/select';

import { getTranslate } from 'utility/i18next';
import { parsePokedexFormSelectId, POKEDEX_FORM_SELECT_ID, updatePokedexEntry } from 'utility/pokedex';
import { sendError } from 'utility/response';

/** The forms select of a Pokédex entry, like Alolan Raichu or Mega Charizard X. */
export default new SelectMenu({
  customId: POKEDEX_FORM_SELECT_ID,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    const parsed = parsePokedexFormSelectId(interaction.customId);
    const slug = interaction.isStringSelectMenu() ? interaction.values[0] : undefined;
    if (!parsed || !slug) return sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    // Only string selects have this custom ID
    return updatePokedexEntry(interaction as StringSelectMenuInteraction, slug, parsed.shiny);
  },
});
