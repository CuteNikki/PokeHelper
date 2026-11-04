import { autumn } from './autumn';
import { birthday } from './birthday';
import { christmas } from './christmas';
import { easter } from './easter';
import { halloween } from './halloween';
import { newYear } from './newYear';
import { pride } from './pride';
import { spring } from './spring';
import { standard } from './standard';
import { summer } from './summer';
import type { Theme } from './types';
import { valentines } from './valentines';
import { winter } from './winter';

/** Every theme, by the name used for its folder in `art/out` and in the bot. */
export const THEMES = {
  standard,
  spring,
  summer,
  autumn,
  winter,
  halloween,
  christmas,
  newYear,
  valentines,
  easter,
  pride,
  birthday,
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof THEMES;
