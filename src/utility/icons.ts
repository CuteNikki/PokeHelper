import { readFile } from 'node:fs/promises';

import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * The bot's interface icons, like the arrows of page buttons or the search button: Lucide's line symbols (ISC licensed, see the
 * comment in each file), kept as SVG in `assets/icons`, named like on lucide.dev. Adding one is adding its file there and its name
 * to {@link ICONS}, which a test checks.
 *
 * Each is made in two looks: on its own in white for buttons, which have a background of their own, and on a rounded square in
 * the bot's blue for text, where it stands on its own. On and Off switches get a check on green and an X on grey, as their color
 * says which they are.
 */
export const ICONS_PATH = 'assets/icons';

/** Every icon, by its file's name, with the normal emoji shown in its place until the bot's own emojis are there. */
export const ICONS = {
  activity: '⚡',
  'arrow-down-wide-narrow': '⬇️',
  'arrow-up-narrow-wide': '⬆️',
  'bell-off': '🔕',
  'book-open': '📖',
  calendar: '📅',
  check: '✅',
  'chevron-left': '◀️',
  'chevron-right': '▶️',
  'chevrons-left': '⏮️',
  'chevrons-right': '⏭️',
  clock: '⏱️',
  copy: '📋',
  download: '📥',
  'file-text': '📝',
  flag: '🏳️',
  image: '🖼️',
  lightbulb: '💡',
  'memory-stick': '💾',
  pencil: '✏️',
  'refresh-cw': '🔁',
  'rotate-ccw': '🔁',
  search: '🔍',
  send: '📨',
  server: '🖥️',
  settings: '⚙️',
  shield: '🛡️',
  sparkles: '✨',
  'trash-2': '🗑️',
  user: '📍',
  x: '✖️',
} as const satisfies Record<string, string>;

/** The name of an icon, like `search`. */
export type IconName = keyof typeof ICONS;

/** Every icon's name. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Where an icon goes: on a button, in text, or as a switch that's on or off. */
export type IconLook = 'button' | 'text' | 'on' | 'off';

/** The bot's blue, the accent of its messages. */
const TEXT_ICON_COLOR = '#3b4cca';
/** How round the corners of the square are, out of its size. */
const TEXT_ICON_RADIUS = 0.28;

const LOOKS: Record<IconLook, { scale: number; weight: number; background: string | null }> = {
  // Thicker and bigger on buttons, where it's the only thing there
  button: { scale: 0.9, weight: 2.5, background: null },
  text: { scale: 0.62, weight: 2.25, background: TEXT_ICON_COLOR },
  // Discord's own green, dark enough for the white check, and a grey that looks turned off
  on: { scale: 0.62, weight: 2.75, background: '#23a55a' },
  off: { scale: 0.62, weight: 2.75, background: '#6d6f78' },
};

/** An icon in a look as a PNG at a size, like for an emoji, which Discord doesn't take as SVG. Null if its file can't be read. */
export async function iconPng(name: IconName, look: IconLook, size: number): Promise<Buffer | null> {
  const svg = await readFile(`${ICONS_PATH}/${name}.svg`, 'utf8').catch(() => null);
  if (svg === null) return null;
  const { scale, weight, background } = LOOKS[look];
  // Always white, on the square or on a button
  const symbol = await loadImage(Buffer.from(svg.replace('stroke="currentColor"', 'stroke="#ffffff"').replace('stroke-width="2"', `stroke-width="${weight}"`)));

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * TEXT_ICON_RADIUS);
    ctx.fill();
  }
  const symbolSize = size * scale;
  ctx.drawImage(symbol, (size - symbolSize) / 2, (size - symbolSize) / 2, symbolSize, symbolSize);
  return canvas.toBuffer('image/png');
}
