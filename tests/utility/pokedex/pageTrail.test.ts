import { expect, test } from 'bun:test';

import type { DexPage } from 'utility/pokedex/pages';
import { moveTrail, setTrail, trailOf } from 'utility/pokedex/pageTrail';

const charizard: DexPage = { kind: 'pokemon', slug: 'charizard' };
const fire: DexPage = { kind: 'type', slug: 'fire' };

test('Back goes back through every page, one at a time', () => {
  // Charizard, then Fire, then the chart of all types
  let step = moveTrail([], 'forward', charizard);
  expect(step).toEqual({ trail: [charizard], back: charizard });
  step = moveTrail(step.trail, 'forward', fire);
  expect(step).toEqual({ trail: [charizard, fire], back: fire });

  // Back to Fire, which goes back to Charizard next, then back to Charizard, which goes nowhere
  step = moveTrail(step.trail, 'back', null);
  expect(step).toEqual({ trail: [charizard], back: charizard });
  step = moveTrail(step.trail, 'back', null);
  expect(step).toEqual({ trail: [], back: null });
});

test('showing the same page another way keeps where Back goes', () => {
  expect(moveTrail([charizard, fire], 'stay', null)).toEqual({ trail: [charizard, fire], back: fire });
  // After a restart, what the custom ID says
  expect(moveTrail([], 'stay', charizard)).toEqual({ trail: [], back: charizard });
});

test('trails are kept by message, and an empty one is forgotten', () => {
  setTrail('message', [charizard, fire]);
  expect(trailOf('message')).toEqual([charizard, fire]);
  setTrail('message', []);
  expect(trailOf('message')).toEqual([]);
});
