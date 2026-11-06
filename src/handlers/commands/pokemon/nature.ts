import { lookupCommand } from 'utility/pokedex/lookupCommand';

export default lookupCommand({
  name: 'nature',
  description: 'Look up a nature, or see them all: which stats it raises and lowers',
  table: 'natures',
  option: { name: 'nature', description: 'The nature, by name. Leave it empty for all of them', required: false },
  kind: 'nature',
  empty: { kind: 'natures', slug: 'all' },
  notFound: (input, t) => t('natures.notFound', { name: input }),
});
