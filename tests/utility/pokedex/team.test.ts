import { expect, test } from 'bun:test';

import { teamMatchups, teamRisk } from 'utility/pokedex/team';

// Two Fire types and a Water type
const fire = { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5 };
const water = { electric: 2, grass: 2, fire: 0.5, water: 0.5 };
const matchups = teamMatchups([fire, fire, water]);
const of = (type: string) => matchups.find((matchup) => matchup.type === type);

test('finds who is weak to and who resists each type, the most dangerous first', () => {
  expect(matchups[0]).toEqual({ type: 'ground', weak: [0, 1], resists: [] });
  expect(of('water')).toEqual({ type: 'water', weak: [0, 1], resists: [2] });
  expect(of('fire')).toEqual({ type: 'fire', weak: [], resists: [0, 1, 2] });
});

test('a type is a danger when more than one is weak to it and fewer resist it, a weak spot with only one, and covered when as many resist it', () => {
  expect(teamRisk(of('ground')!)).toBe('danger');
  expect(teamRisk(of('water')!)).toBe('danger');
  expect(teamRisk(of('electric')!)).toBe('weakSpot');
  expect(teamRisk(of('grass')!)).toBe('covered');
  expect(teamRisk(of('fire')!)).toBe('covered');
  expect(teamRisk(of('normal')!)).toBeNull();
});
