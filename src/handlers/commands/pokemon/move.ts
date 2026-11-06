import { lookupCommand } from 'utility/pokedex/lookupCommand';

export default lookupCommand({
  name: 'move',
  description: 'Look up a move: its type, power, accuracy, PP and effect',
  kind: 'move',
  table: 'moves',
  option: { name: 'move', description: 'The move, by name' },
  notFound: (input, t) => t('moves.notFound', { name: input }),
});
