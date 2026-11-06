import { expect, test } from 'bun:test';

import type { ApiPokemon } from 'utility/pokedex/api';
import { movesByGame } from 'utility/pokedex/learnset';
import { setPokedexData } from 'utility/pokedex/names';

const named = (name: string) => ({ name, url: '' });
const learned = (move: string, ...details: [group: string, method: string, level: number][]): ApiPokemon['moves'][number] => ({
  move: named(move),
  version_group_details: details.map(([group, method, level]) => ({ version_group: named(group), move_learn_method: named(method), level_learned_at: level })),
});

test('groups the moves by game, newest first, leveling up first and by level, then the other ways', () => {
  setPokedexData({
    versionGroups: { 'red-blue': { versions: ['red', 'blue'], order: 1001 }, 'scarlet-violet': { versions: ['scarlet', 'violet'], order: 9025 } },
  });
  const moves = [
    learned('thunderbolt', ['red-blue', 'machine', 0], ['scarlet-violet', 'machine', 0]),
    learned('thunder-shock', ['red-blue', 'level-up', 1], ['scarlet-violet', 'level-up', 1]),
    learned('volt-tackle', ['scarlet-violet', 'egg', 0]),
    learned('agility', ['scarlet-violet', 'level-up', 24]),
    learned('quick-attack', ['red-blue', 'level-up', 16]),
  ];
  expect(movesByGame(moves).map((game) => [game.group, game.moves.map((entry) => `${entry.method}:${entry.move}`)])).toEqual([
    ['scarlet-violet', ['level-up:thunder-shock', 'level-up:agility', 'machine:thunderbolt', 'egg:volt-tackle']],
    ['red-blue', ['level-up:thunder-shock', 'level-up:quick-attack', 'machine:thunderbolt']],
  ]);
});
