import { lookupCommand } from 'utility/pokedex/lookup';
import { buildLocation } from 'utility/pokedex/lookups/location';
import { getPokedexData, nameOf } from 'utility/pokedex/names';

export default lookupCommand({
  name: 'location',
  description: 'Look up a place: its region and the wild Pokémon found there',
  table: 'locations',
  option: { name: 'location', description: 'The place, by name' },
  // Several regions have places called the same, like the Pokémon League
  suggestionDetail: (slug, language) => {
    const region = getPokedexData().locationRegions[slug];
    return region ? nameOf('regions', region, language) : null;
  },
  build: (slug, language, t) => buildLocation(slug, language, t),
  notFound: (input, t) => t('locations.notFound', { name: input }),
});
