import { createCanvas } from '@napi-rs/canvas';
import { formatEmoji, type Client } from 'discord.js';

import { ICON_NAMES, ICONS, iconPng, textIcons, type IconLook, type IconName } from 'utility/icons';
import { logger } from 'utility/logger';
import { typeIconPng } from 'utility/pokedex/typeIcons';
import { TYPE_COLORS } from 'utility/pokedex/types';

/**
 * The bot's own emojis: the pieces stat bars are made of, in every type's color, the type icons, and the interface icons for
 * buttons and text. They're uploaded to the bot's application when they're missing, so they work in every server without being
 * added to one.
 *
 * The version is part of their names. Change it after changing how a set looks, so the old ones are replaced.
 */
const STAT_BAR_PREFIX = 'statbar1';
const TYPE_ICON_PREFIX = 'typeicon2';
const ICON_PREFIXES: Record<IconLook, string> = { button: 'btn2', text: 'icon1', on: 'switch1', off: 'switch1' };
/** The names of the bot's own emojis of any version, so old ones are deleted and emojis added by hand are left alone. */
const OWN_EMOJI = /^(statbar|typeicon|btn|icon|switch)\d+_/;

/** The pieces of a bar: a rounded start, the middle, and a rounded end. */
export type BarPiece = 'start' | 'middle' | 'end';
const PIECES: BarPiece[] = ['start', 'middle', 'end'];

const SIZE = 128;
/** The bar is thinner than the emoji, so the bars of lines below each other don't touch. */
const BAR_HEIGHT = 64;
const EMPTY_COLOR = '#1e1e2e';

/** The emojis by name, like `<:statbar1_fire_start:123>`, once they're there. */
const emojis = new Map<string, string>();

/** A bar piece's name: the color is a type, or `empty`. */
const barName = (color: string, piece: BarPiece) => `${STAT_BAR_PREFIX}_${color}_${piece}`;
const typeIconName = (type: string) => `${TYPE_ICON_PREFIX}_${type}`;
/** An interface icon's name. Emoji names can't have dashes, which Lucide's names have. */
const interfaceIconName = (name: IconName, look: IconLook) => `${ICON_PREFIXES[look]}_${name.replaceAll('-', '_')}`;
const SWITCH_ON = `${ICON_PREFIXES.on}_on`;
const SWITCH_OFF = `${ICON_PREFIXES.off}_off`;

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

/** Every emoji there should be, by name, with how to make its picture. */
function wantedEmojis(): Map<string, () => Promise<Buffer | null>> {
  const wanted = new Map<string, () => Promise<Buffer | null>>();
  const colors: [string, string][] = [
    ...Object.entries(TYPE_COLORS).map(([type, color]): [string, string] => [type, `#${color.toString(16).padStart(6, '0')}`]),
    ['empty', EMPTY_COLOR],
  ];
  for (const [name, color] of colors) {
    for (const piece of PIECES) wanted.set(barName(name, piece), () => Promise.resolve(renderPiece(color, piece)));
  }
  for (const type of Object.keys(TYPE_COLORS)) wanted.set(typeIconName(type), () => typeIconPng(type, SIZE));
  for (const name of ICON_NAMES) {
    for (const look of ['button', 'text'] as const) wanted.set(interfaceIconName(name, look), () => iconPng(name, look, SIZE));
  }
  wanted.set(SWITCH_ON, () => iconPng('check', 'on', SIZE));
  wanted.set(SWITCH_OFF, () => iconPng('x', 'off', SIZE));
  return wanted;
}

/**
 * Upload the emojis the bot doesn't have yet, and delete those of older versions.
 * Until this is done, or if it fails, {@link statBarEmoji} and {@link typeEmoji} have nothing, and the text does without them, while
 * {@link buttonIcon} and {@link textIcon} give the icon's normal emoji.
 */
export async function syncBotEmojis(client: Client<true>): Promise<void> {
  const wanted = wantedEmojis();
  const existing = await client.application.emojis.fetch();

  for (const emoji of existing.values()) {
    if (!emoji.name || !OWN_EMOJI.test(emoji.name)) continue;
    if (wanted.has(emoji.name)) {
      emojis.set(emoji.name, formatEmoji({ id: emoji.id, name: emoji.name }));
    } else {
      await emoji.delete().catch((error: unknown) => logger.warn(error, `Failed to delete the old emoji ${emoji.name}`));
    }
  }

  const missing = [...wanted].filter(([name]) => !emojis.has(name));
  if (missing.length > 0) {
    logger.info(`Uploading ${missing.length} emojis`);
    // One after another, as uploading is rate limited
    for (const [name, render] of missing) {
      const attachment = await render();
      if (!attachment) continue;
      const emoji = await client.application.emojis.create({ name, attachment });
      emojis.set(name, formatEmoji({ id: emoji.id, name }));
    }
    logger.info(`Uploaded ${missing.length} emojis`);
  }

  // The icons in the translations, like {{icon.trophy}}, are the bot's own from now on
  for (const name of ICON_NAMES) textIcons[name] = textIcon(name);
}

/** The emoji of a bar piece in a type's color, or `empty`, or null if the emojis aren't there. */
export const statBarEmoji = (color: string, piece: BarPiece) => emojis.get(barName(color, piece)) ?? null;

/** The emoji of a type's icon, or null if it isn't there. */
export const typeEmoji = (type: string) => emojis.get(typeIconName(type)) ?? null;

/** An interface icon for a button, on dark grey, like `search`, or its normal emoji while it isn't there. */
export const buttonIcon = (name: IconName) => emojis.get(interfaceIconName(name, 'button')) ?? ICONS[name];

/** An interface icon for text, on the bot's blue, like `server`, or its normal emoji while it isn't there. */
export const textIcon = (name: IconName) => emojis.get(interfaceIconName(name, 'text')) ?? ICONS[name];

/** The icon of an On/Off switch, a check on green or an X on grey, or ✅ and ✖️ while it isn't there. */
export const switchIcon = (on: boolean) => emojis.get(on ? SWITCH_ON : SWITCH_OFF) ?? (on ? ICONS.check : ICONS.x);

/** A type's name with its icon in front, or the name alone while the icons aren't there. */
export const withTypeEmoji = (type: string, name: string) => {
  const emoji = typeEmoji(type);
  return emoji ? `${emoji} ${name}` : name;
};
