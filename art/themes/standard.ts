import type { Theme } from './types';

/**
 * The everyday look: a blue sky, white clouds, green hills and grass, with a few flowers in it. Worn between the seasons too, like
 * late in autumn, so it's kept plain, without butterflies, and can't be taken for spring or summer.
 */
export const standard: Theme = {
  sky: ['#6fa8ff', '#3b4cca'],
  cloud: '#f3f7ff',
  sparkles: ['#ffffff', '#ffcb05'],
  ground: { kind: 'grass', colors: ['#2f8f5b', '#3fae6a', '#5cc97f'] },
  // Warm sunlight on the mascot and the prop, so it doesn't look pale against the cool sky
  light: { color: '#ffb066', amount: 0.1 },
  hills: ['#9ccfc0', '#6dbb8b'],
  trees: { kind: 'round', colors: ['#7a5a45', '#4f9e6b'] },
  flowers: { colors: ['#ffffff', '#ffe066'], count: 3 },
  ear: '#46507e',
  titleShadow: 'rgba(20,26,77,0.35)',
};
