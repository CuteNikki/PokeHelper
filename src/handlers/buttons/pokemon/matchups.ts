import { Button } from 'classes/base/button';

import { POKEDEX_MATCHUPS_PREFIX, showMatchups } from 'utility/pokedex/matchups';

/** The Matchups button of a Pokédex entry. Anyone can press it, as only they see the answer. */
export default new Button({
  customId: POKEDEX_MATCHUPS_PREFIX,
  includesCustomId: true,
  execute: (interaction) => showMatchups(interaction),
});
