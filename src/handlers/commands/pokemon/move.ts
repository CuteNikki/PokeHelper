import { lookupCommand } from 'utility/pokedex/lookup';
import { buildMove } from 'utility/pokedex/lookups/move';

export default lookupCommand({
  name: 'move',
  description: 'Look up a move: its type, power, accuracy, PP and effect',
  table: 'moves',
  option: { name: 'move', description: 'The move, by name' },
  build: buildMove,
  notFound: (input, t) => t('moves.notFound', { name: input }),
});
