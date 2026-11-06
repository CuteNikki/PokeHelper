import { lookupCommand } from 'utility/pokedex/lookupCommand';
import { isBerryItem } from 'utility/pokedex/lookups/item';

export default lookupCommand({
  name: 'berry',
  description: 'Look up a berry: its flavors, how it grows and what Natural Gift does with it',
  kind: 'berry',
  table: 'items',
  only: isBerryItem,
  option: { name: 'berry', description: 'The berry, by name' },
  notFound: (input, t) => t('berries.notFound', { name: input }),
});
