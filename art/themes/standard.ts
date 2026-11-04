import type { Theme } from './types';

/** The everyday look: a blue sky, white clouds and green grass. */
export const standard: Theme = {
  sky: ['#6fa8ff', '#3b4cca'],
  cloud: '#f3f7ff',
  sparkles: ['#ffffff', '#ffcb05'],
  ground: { kind: 'grass', colors: ['#2f8f5b', '#3fae6a', '#5cc97f'] },
  ear: '#46507e',
  titleShadow: 'rgba(20,26,77,0.35)',
};
