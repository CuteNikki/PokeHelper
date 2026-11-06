import { createHash } from 'node:crypto';

import { createCanvas } from '@napi-rs/canvas';
import { formatEmoji, type Client } from 'discord.js';

import { ICON_NAMES, ICONS, iconPng, textIcons, type IconName } from 'utility/icons';
import { logger } from 'utility/logger';
import { typeIconPng } from 'utility/pokedex/typeIcons';
import { TYPE_COLORS } from 'utility/pokedex/types';

/**
 * The bot's own emojis: the pieces stat bars are made of, in every type's color, the type icons, and the interface icons for
 * buttons and text. They're uploaded to the bot's application when they're missing, so they work in every server without being
 * added to one.
 *
 * Each name ends in a fingerprint of its picture, like `txt_trophy_3fa9c`, so a picture that changed gets a new name and replaces
 * the old one on the next start, while unchanged ones are left as they are.
 */

/** The longest name Discord takes for an emoji. */
export const MAX_EMOJI_NAME = 32;
/** How much of a picture's fingerprint goes in its name, short enough that every name fits. */
const FINGERPRINT_LENGTH = 5;
/** The bot's own emojis, so emojis added to the application by hand are left alone. The second part are the names from before fingerprints. */
const OWN_EMOJI = /^(bar|typ|btn|txt|sw)_[a-z0-9_]+_[0-9a-f]{5}$|^(statbar|typeicon|btn|icon|switch)\d+_/;

/** The pieces of a bar: a rounded start, the middle, and a rounded end. */
export type BarPiece = 'start' | 'middle' | 'end';
const PIECES: BarPiece[] = ['start', 'middle', 'end'];

const SIZE = 128;
/** The bar is thinner than the emoji, so the bars of lines below each other don't touch. */
const BAR_HEIGHT = 64;
const EMPTY_COLOR = '#1e1e2e';

/** The emojis by what they are, like `txt_trophy`, as they're written in messages, once they're there. */
const emojis = new Map<string, string>();

/** What each emoji is, which its name starts with. Emoji names can't have dashes, which Lucide's names have. */
const barKey = (color: string, piece: BarPiece) => `bar_${color}_${piece}`;
const typeKey = (type: string) => `typ_${type}`;
const buttonKey = (name: IconName) => `btn_${name.replaceAll('-', '_')}`;
const textKey = (name: IconName) => `txt_${name.replaceAll('-', '_')}`;
const SWITCH_ON = 'sw_on';
const SWITCH_OFF = 'sw_off';

/** Draw a piece of a bar, filling the width so the pieces join up. */
function renderPiece(color: string, piece: BarPiece): Buffer {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const top = (SIZE - BAR_HEIGHT) / 2;
  const radius = BAR_HEIGHT / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, top, SIZE, BAR_HEIGHT, piece === 'start' ? [radius, 0, 0, radius] : piece === 'end' ? [0, radius, radius, 0] : 0);
  ctx.fill();
  return canvas.toBuffer('image/png');
}

/** Every emoji there should be, by what it is, with how to make its picture. */
export function wantedEmojis(): Map<string, () => Promise<Buffer | null>> {
  const wanted = new Map<string, () => Promise<Buffer | null>>();
  const colors: [string, string][] = [
    ...Object.entries(TYPE_COLORS).map(([type, color]): [string, string] => [type, `#${color.toString(16).padStart(6, '0')}`]),
    ['empty', EMPTY_COLOR],
  ];
  for (const [name, color] of colors) {
    for (const piece of PIECES) wanted.set(barKey(name, piece), () => Promise.resolve(renderPiece(color, piece)));
  }
  for (const type of Object.keys(TYPE_COLORS)) wanted.set(typeKey(type), () => typeIconPng(type, SIZE));
  for (const name of ICON_NAMES) {
    wanted.set(buttonKey(name), () => iconPng(name, 'button', SIZE));
    wanted.set(textKey(name), () => iconPng(name, 'text', SIZE));
  }
  wanted.set(SWITCH_ON, () => iconPng('check', 'on', SIZE));
  wanted.set(SWITCH_OFF, () => iconPng('x', 'off', SIZE));
  return wanted;
}

/** An emoji's name: what it is, and the fingerprint of its picture. */
export const emojiName = (key: string, picture: Buffer) => `${key}_${createHash('sha256').update(picture).digest('hex').slice(0, FINGERPRINT_LENGTH)}`;

/**
 * Upload the emojis the bot doesn't have yet, or whose picture changed, and delete the ones it doesn't use anymore.
 * The pictures are drawn here to tell whether they changed, which takes a moment but asks nothing of Discord.
 * Until this is done, or if it fails, {@link statBarEmoji} and {@link typeEmoji} have nothing, and the text does without them, while
 * {@link buttonIcon} and {@link textIcon} give the icon's normal emoji.
 */
export async function syncBotEmojis(client: Client<true>): Promise<void> {
  const pictures = new Map<string, { key: string; picture: Buffer }>();
  for (const [key, render] of wantedEmojis()) {
    const picture = await render();
    if (picture) pictures.set(emojiName(key, picture), { key, picture });
  }

  const existing = await client.application.emojis.fetch();
  for (const emoji of existing.values()) {
    if (!emoji.name || !OWN_EMOJI.test(emoji.name)) continue;
    const wanted = pictures.get(emoji.name);
    if (wanted) {
      emojis.set(wanted.key, formatEmoji({ id: emoji.id, name: emoji.name }));
    } else {
      // Changed since, or not used anymore
      await emoji.delete().catch((error: unknown) => logger.warn(error, `Failed to delete the old emoji ${emoji.name}`));
    }
  }

  const missing = [...pictures].filter(([, { key }]) => !emojis.has(key));
  if (missing.length > 0) {
    logger.info(`Uploading ${missing.length} emojis`);
    // One after another, as uploading is rate limited
    for (const [name, { key, picture }] of missing) {
      const emoji = await client.application.emojis.create({ name, attachment: picture });
      emojis.set(key, formatEmoji({ id: emoji.id, name }));
    }
    logger.info(`Uploaded ${missing.length} emojis`);
  }

  // The icons in the translations, like {{icon.trophy}}, are the bot's own from now on
  for (const name of ICON_NAMES) textIcons[name] = textIcon(name);
}

/** The emoji of a bar piece in a type's color, or `empty`, or null if the emojis aren't there. */
export const statBarEmoji = (color: string, piece: BarPiece) => emojis.get(barKey(color, piece)) ?? null;

/** The emoji of a type's icon, or null if it isn't there. */
export const typeEmoji = (type: string) => emojis.get(typeKey(type)) ?? null;

/** An interface icon for a button, on dark grey, like `search`, or its normal emoji while it isn't there. */
export const buttonIcon = (name: IconName) => emojis.get(buttonKey(name)) ?? ICONS[name];

/** An interface icon for text, on the bot's blue, like `server`, or its normal emoji while it isn't there. */
export const textIcon = (name: IconName) => emojis.get(textKey(name)) ?? ICONS[name];

/** The icon of an On/Off switch, a check on green or an X on grey, or ✅ and ✖️ while it isn't there. */
export const switchIcon = (on: boolean) => emojis.get(on ? SWITCH_ON : SWITCH_OFF) ?? (on ? ICONS.check : ICONS.x);

/** A type's name with its icon in front, or the name alone while the icons aren't there. */
export const withTypeEmoji = (type: string, name: string) => {
  const emoji = typeEmoji(type);
  return emoji ? `${emoji} ${name}` : name;
};
