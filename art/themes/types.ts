import type { SKRSContext2D } from '@napi-rs/canvas';

/** Where something is drawn: the square avatar, shown tiny, or the wide banner. */
export interface Scene {
  kind: 'avatar' | 'banner';
  width: number;
  height: number;
}

type Draw = (ctx: SKRSContext2D, scene: Scene, time: number) => void;

/**
 * A look for the mascot's scenes. Anything that moves turns a whole number of times in a loop, `time` going from 0 to 1, so the
 * last frame leads into the first.
 */
export interface Theme {
  /** The sky, from the top down. The banner runs it diagonally, the second color on the left. */
  sky: [string, string];
  /** Clouds drifting by, or null for none. */
  cloud: string | null;
  /** The two colors of the sparkles. */
  sparkles: [string, string];
  /** Grass or snow, its rows from the back to the front. */
  ground: { kind: 'grass' | 'snow'; colors: [string, string, string] };
  /** Hills far behind the ground, the farther row first. Paler the farther away, as if seen through air. */
  hills: [string, string];
  /** Trees along the far hills, round or pointed, their trunk and crown colors. They get snow on them when the ground is snowy. */
  trees?: { kind: 'round' | 'pine'; colors: [string, string] };
  /**
   * The light of the scene, which the mascot and the prop next to it are tinted with, so at night they don't glow white in the dark:
   * a color and how much of it, from 0 to 1. Left out in daylight.
   */
  light?: { color: string; amount: number };
  /** Little flowers peeking out between the blades of the back row of grass: their colors, the color of their middles, and how many. */
  flowers?: { colors: string[]; center?: string; count?: number };
  /** Small things in front of everything but the name, like eggs at the very front, fireflies or snow glinting. */
  details?: Draw;
  /** The mascot's color and the color of the shade on its side, if not its usual warm yellow. */
  body?: [string, string];
  /** The color of the tips of the mascot's ears. */
  ear: string;
  /** The color of the shadow under the name. */
  titleShadow: string;
  /** Far away in the sky, behind everything, like a moon. */
  backdrop?: Draw;
  /** Moving in the sky, in front of the clouds and the hills but behind the grass and the name, like bats, falling snow or petals. */
  life?: Draw;
  /** Next to the mascot on the banner, like a pumpkin, standing on y. Left out of the avatar, where it'd be cut off. */
  prop?: (ctx: SKRSContext2D, x: number, y: number, scale: number, time: number) => void;
  /** On the mascot, in its coordinates: the top of its head is at y -175, its eyes at y -95. */
  hat?: (ctx: SKRSContext2D, time: number) => void;
}
