import type { StringSelectMenuInteraction } from 'discord.js';

import { SelectMenu } from 'classes/base/select';

import { LOCATION_GAME_PREFIX, updateLocation } from 'utility/pokedex/lookups/location';

/** The select of games on a place from /location. */
export default new SelectMenu({
  customId: LOCATION_GAME_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  // Only string selects have this custom ID
  execute: (interaction) => updateLocation(interaction as StringSelectMenuInteraction),
});
