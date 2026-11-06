import { expect, test } from 'bun:test';

import { dangers, teamMatchups } from 'utility/pokedex/team';

test('counts who is weak to and who resists each type, the most dangerous first', () => {
  // Two Fire types and a Water type
  const fire = { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5 };
  const water = { electric: 2, grass: 2, fire: 0.5, water: 0.5 };
  const matchups = teamMatchups([fire, fire, water]);
  expect(matchups[0]).toEqual({ type: 'ground', weak: 2, resists: 0 });
  expect(matchups.find((matchup) => matchup.type === 'water')).toEqual({ type: 'water', weak: 2, resists: 1 });
  expect(matchups.find((matchup) => matchup.type === 'fire')).toEqual({ type: 'fire', weak: 0, resists: 3 });
});

test('a type is a danger when more than one is weak to it and fewer resist it', () => {
  const dangerous = dangers([
    { type: 'ground', weak: 2, resists: 0 },
    { type: 'water', weak: 2, resists: 2 },
    { type: 'electric', weak: 1, resists: 0 },
  ]);
  expect(dangerous.map((matchup) => matchup.type)).toEqual(['ground']);
});
