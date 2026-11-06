import { lookupCommand } from 'utility/pokedex/lookup';
import { buildNature, buildNatureList } from 'utility/pokedex/lookups/nature';

export default lookupCommand({
  name: 'nature',
  description: 'Look up a nature, or see them all: which stats it raises and lowers',
  table: 'natures',
  option: { name: 'nature', description: 'The nature, by name. Leave it empty for all of them', required: false },
  empty: buildNatureList,
  build: buildNature,
  notFound: (input, t) => t('natures.notFound', { name: input }),
});
