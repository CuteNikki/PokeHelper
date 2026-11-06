import { lookupCommand } from 'utility/pokedex/lookup';
import { buildLocation } from 'utility/pokedex/lookups/location';

export default lookupCommand({
  name: 'location',
  description: 'Look up a place: its region and the wild Pokémon found there',
  table: 'locations',
  option: { name: 'location', description: 'The place, by name' },
  build: (slug, language, t) => buildLocation(slug, language, t),
  notFound: (input, t) => t('locations.notFound', { name: input }),
});
