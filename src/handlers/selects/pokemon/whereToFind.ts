import type { StringSelectMenuInteraction } from 'discord.js';

import { SelectMenu } from 'classes/base/select';

import { POKEDEX_WHERE_GAME_PREFIX, showWhereToFind } from 'utility/pokedex/encounters';

/** The select of games on where a Pokémon is found. Only whoever pressed Where to find sees it. */
export default new SelectMenu({
  customId: POKEDEX_WHERE_GAME_PREFIX,
  includesCustomId: true,
  // Only string selects have this custom ID
  execute: (interaction) => showWhereToFind(interaction as StringSelectMenuInteraction),
});
