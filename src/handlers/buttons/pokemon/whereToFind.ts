import { Button } from 'classes/base/button';

import { POKEDEX_WHERE_PREFIX, showWhereToFind } from 'utility/pokedex/encounters';

/** The Where to find button of a Pokédex entry. Anyone can press it, as only they see the answer. */
export default new Button({
  customId: POKEDEX_WHERE_PREFIX,
  includesCustomId: true,
  execute: (interaction) => showWhereToFind(interaction),
});
