import { lookupCommand } from 'utility/pokedex/lookupCommand';

export default lookupCommand({
  name: 'ability',
  description: 'Look up an ability: what it does and which Pokémon have it',
  kind: 'ability',
  table: 'abilities',
  option: { name: 'ability', description: 'The ability, by name' },
  notFound: (input, t) => t('abilities.notFound', { name: input }),
});
