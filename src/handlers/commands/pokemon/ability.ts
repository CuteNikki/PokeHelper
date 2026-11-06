import { lookupCommand } from 'utility/pokedex/lookup';
import { buildAbility } from 'utility/pokedex/lookups/ability';

export default lookupCommand({
  name: 'ability',
  description: 'Look up an ability: what it does and which Pokémon have it',
  table: 'abilities',
  option: { name: 'ability', description: 'The ability, by name' },
  build: buildAbility,
  notFound: (input, t) => t('abilities.notFound', { name: input }),
});
