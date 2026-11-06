import { lookupCommand } from 'utility/pokedex/lookup';
import { buildItem } from 'utility/pokedex/lookups/item';

export default lookupCommand({
  name: 'item',
  description: 'Look up an item: its picture, description, effect and who holds it',
  table: 'items',
  option: { name: 'item', description: 'The item, by name' },
  build: buildItem,
  notFound: (input, t) => t('items.notFound', { name: input }),
});
