import { lookupCommand } from 'utility/pokedex/lookupCommand';

export default lookupCommand({
  name: 'item',
  description: 'Look up an item: its picture, description, effect and who holds it',
  kind: 'item',
  table: 'items',
  option: { name: 'item', description: 'The item, by name' },
  notFound: (input, t) => t('items.notFound', { name: input }),
});
