import { lookupCommand } from 'utility/pokedex/lookup';
import { buildBerry, isBerryItem } from 'utility/pokedex/lookups/berry';

export default lookupCommand({
  name: 'berry',
  description: 'Look up a berry: its flavors, how it grows and what Natural Gift does with it',
  table: 'items',
  only: isBerryItem,
  option: { name: 'berry', description: 'The berry, by name' },
  build: buildBerry,
  notFound: (input, t) => t('berries.notFound', { name: input }),
});
