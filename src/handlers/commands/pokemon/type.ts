import { lookupCommand } from 'utility/pokedex/lookupCommand';
import { isType } from 'utility/pokedex/typeChart';

export default lookupCommand({
  name: 'type',
  description: 'Look up a type, or see the chart of all types: what it is strong and weak against',
  table: 'types',
  kind: 'type',
  only: isType,
  option: { name: 'type', description: 'The type. Leave it empty for the chart of all types', required: false },
  empty: { kind: 'types', slug: 'all' },
  notFound: (input, t) => t('types.notFound', { name: input }),
});
