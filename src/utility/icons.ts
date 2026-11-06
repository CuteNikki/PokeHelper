import { readFile } from 'node:fs/promises';

import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * The bot's interface icons, like the arrows of page buttons or the search button: Lucide's line symbols (ISC licensed, see the
 * comment in each file), kept as SVG in `assets/icons`, named like on lucide.dev. Adding one is adding its file there and its name
 * to {@link ICONS}, which a test checks.
 *
 * Each is made in two looks, a white symbol on a rounded square: dark grey for buttons, which stands out on Discord's buttons in the
 * dark and the light theme, where a symbol on its own would vanish in the light one, and the bot's blue for text. On and Off
 * switches get a check on green and an X on grey, as their color says which they are.
 */
export const ICONS_PATH = 'assets/icons';

/** Every icon, by its file's name, with the normal emoji shown in its place until the bot's own emojis are there. */
export const ICONS = {
  activity: '⚡',
  'alarm-clock': '⏰',
  'arrow-down-wide-narrow': '⬇️',
  'arrow-left-right': '🔀',
  'arrow-up-narrow-wide': '⬆️',
  backpack: '🎒',
  ban: '🚫',
  'bell-off': '🔕',
  bird: '🕊️',
  'book-open': '📖',
  cake: '🎂',
  calendar: '📅',
  'chart-column': '📊',
  check: '✅',
  cherry: '🍒',
  'chevron-left': '◀️',
  'chevron-right': '▶️',
  'chevrons-left': '⏮️',
  'chevrons-right': '⏭️',
  'circle-help': '❔',
  'circle-user': '👤',
  clock: '⏱️',
  copy: '📋',
  'door-open': '👢',
  download: '📥',
  drama: '🎭',
  'file-text': '📝',
  flag: '🏳️',
  folder: '📁',
  'gamepad-2': '🎮',
  gavel: '🔨',
  gift: '🎁',
  handshake: '🤝',
  hash: '🔢',
  hourglass: '⏳',
  house: '🏠',
  image: '🖼️',
  leaf: '🍃',
  lightbulb: '💡',
  link: '🔗',
  lock: '🔒',
  map: '🗺️',
  'map-pin': '📍',
  'memory-stick': '💾',
  minus: '➖',
  'message-square': '💬',
  'messages-square': '🧵',
  paperclip: '📎',
  'paw-print': '🐾',
  pencil: '✏️',
  plus: '➕',
  power: '🔁',
  'refresh-cw': '🔁',
  'rotate-ccw': '🔁',
  'scroll-text': '📜',
  search: '🔍',
  send: '📨',
  server: '🖥️',
  settings: '⚙️',
  shield: '🛡️',
  smile: '😀',
  sparkles: '✨',
  star: '⭐',
  sticker: '🖼️',
  swords: '⚔️',
  tag: '🏷️',
  'timer-off': '⌛',
  'trash-2': '🗑️',
  'trending-up': '📈',
  'triangle-alert': '⚠️',
  trophy: '🏆',
  user: '📍',
  'user-minus': '📤',
  'user-plus': '📥',
  users: '👥',
  'volume-2': '🔊',
  'volume-x': '🔇',
  x: '✖️',
  zap: '⚡',
} as const satisfies Record<string, string>;

/** The name of an icon, like `search`. */
export type IconName = keyof typeof ICONS;

/** Every icon's name. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/**
 * Each icon as it's written in text, for `{{icon.trophy}}` in the translations: its normal emoji, until the bot's own emojis
 * are there and take its place. Changed in place, so the translations see the change without being set up again.
 */
export const textIcons: Record<IconName, string> = { ...ICONS };

/** Where an icon goes: on a button, in text, as a switch that's on or off, or as a stat that goes up or down. */
export type IconLook = 'button' | 'text' | 'on' | 'off' | 'up' | 'down';

/** The bot's blue, the accent of its messages. */
const TEXT_ICON_COLOR = '#3b4cca';
/** How round the corners of the square are, out of its size. */
const ICON_RADIUS = 0.28;

const LOOKS: Record<IconLook, { scale: number; weight: number; background: string }> = {
  // Discord's own dark grey, which stands apart from its buttons in both themes
  button: { scale: 0.62, weight: 2.25, background: '#2b2d31' },
  text: { scale: 0.62, weight: 2.25, background: TEXT_ICON_COLOR },
  // Discord's own green, dark enough for the white check, and a grey that looks turned off
  on: { scale: 0.62, weight: 2.75, background: '#23a55a' },
  off: { scale: 0.62, weight: 2.75, background: '#6d6f78' },
  // The same green for a stat that goes up, and Discord's own red for one that goes down
  up: { scale: 0.62, weight: 2.75, background: '#23a55a' },
  down: { scale: 0.62, weight: 2.75, background: '#da373c' },
};

/** An icon in a look as a PNG at a size, like for an emoji, which Discord doesn't take as SVG. Null if its file can't be read. */
export async function iconPng(name: IconName, look: IconLook, size: number): Promise<Buffer | null> {
  const svg = await readFile(`${ICONS_PATH}/${name}.svg`, 'utf8').catch(() => null);
  if (svg === null) return null;
  const { scale, weight, background } = LOOKS[look];
  // Always white, on its square
  const symbol = await loadImage(Buffer.from(svg.replace('stroke="currentColor"', 'stroke="#ffffff"').replace('stroke-width="2"', `stroke-width="${weight}"`)));

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * ICON_RADIUS);
  ctx.fill();
  const symbolSize = size * scale;
  ctx.drawImage(symbol, (size - symbolSize) / 2, (size - symbolSize) / 2, symbolSize, symbolSize);
  return canvas.toBuffer('image/png');
}
