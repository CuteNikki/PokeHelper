import { lookupCommand } from 'utility/pokedex/lookupCommand';
import { getPokedexData, nameOf } from 'utility/pokedex/names';

export default lookupCommand({
  name: 'location',
  description: 'Look up a place: its region and the wild Pokémon found there',
  kind: 'location',
  table: 'locations',
  option: { name: 'location', description: 'The place, by name' },
  // Several regions have places called the same, like the Pokémon League
  suggestionDetail: (slug, language) => {
    const region = getPokedexData().locationRegions[slug];
    return region ? nameOf('regions', region, language) : null;
  },
  notFound: (input, t) => t('locations.notFound', { name: input }),
});
