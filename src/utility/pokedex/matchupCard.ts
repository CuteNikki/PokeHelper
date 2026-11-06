import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';

import { drawContained, drawTypeBadge, truncateText, withAlpha } from 'utility/canvas';

export interface MatchupCardType {
  name: string;
  color: string;
}

export interface MatchupCardWeakness {
  type: MatchupCardType;
  /** Like `×2`. */
  multiplier: string;
  /** Pokémon of the type to use against it. */
  pokemon: { name: string; image: Image | null }[];
  /** Moves of the type to use against it. */
  moves: string[];
}

export interface MatchupCardEntry {
  type: MatchupCardType;
  multiplier: string;
}

export interface MatchupCardData {
  name: string;
  artwork: Image | null;
  types: MatchupCardType[];
  /** Shown at the top right, like "Matchups". */
  title: string;
  weak: MatchupCardWeakness[];
  resists: MatchupCardEntry[];
  immune: MatchupCardEntry[];
  labels: { weak: string; resists: string; immune: string; pokemon: string; moves: string };
  note: string;
}

const WIDTH = 880;
const PADDING = 32;
const HEADER_HEIGHT = 168;
const ARTWORK_SIZE = 120;
const SECTION_LABEL_HEIGHT = 44;
const WEAK_ROW_HEIGHT = 100;
const ENTRY_ROW_HEIGHT = 46;
const ENTRY_COLUMNS = 3;
const SECTION_GAP = 12;
const FOOTER_HEIGHT = 44;
const BADGE_WIDTH = 120;
const BADGE_HEIGHT = 30;
const EXAMPLE_SIZE = 40;
/** The width of the labels in front of the Pokémon and the moves. */
const EXAMPLE_LABEL_WIDTH = 84;
const CHIP_HEIGHT = 26;
const CHIP_GAP = 8;

const COLORS = {
  cardBg: 'rgba(42, 43, 60, 0.85)',
  rowBg: 'rgba(255, 255, 255, 0.04)',
  textWhite: '#ffffff',
  textGray: '#a6adc8',
  divider: 'rgba(255, 255, 255, 0.08)',
};

/** The multiplier next to a badge, like `×2`. */
function drawMultiplier(ctx: SKRSContext2D, multiplier: string, x: number, centerY: number) {
  ctx.font = 'bold 20px "Roboto", "EmojiFallback"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(multiplier, x, centerY + 1);
}

function drawSectionLabel(ctx: SKRSContext2D, label: string, y: number) {
  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, 1);
  ctx.font = 'bold 13px "Roboto"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(label.toUpperCase(), PADDING, y + 30);
}

/** A small label in front of a line of examples, like POKÉMON. */
function drawExampleLabel(ctx: SKRSContext2D, label: string, x: number, centerY: number) {
  ctx.font = 'bold 12px "Roboto"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(truncateText(ctx, label.toUpperCase(), EXAMPLE_LABEL_WIDTH - 10), x, centerY + 1);
}

/** The moves as chips tinted in the type's color, made narrower together if they don't fit. */
function drawMoveChips(ctx: SKRSContext2D, moves: string[], color: string, x: number, y: number, width: number) {
  ctx.font = '14px "Roboto", "EmojiFallback"';
  const natural = moves.map((move) => ctx.measureText(move).width + 24);
  const room = width - CHIP_GAP * Math.max(moves.length - 1, 0);
  const total = natural.reduce((sum, chip) => sum + chip, 0);
  const widths = total > room ? natural.map(() => room / moves.length) : natural;
  let left = x;
  moves.forEach((move, index) => {
    const chipWidth = widths[index] ?? 0;
    ctx.fillStyle = withAlpha(color, 0.28);
    ctx.beginPath();
    ctx.roundRect(left, y, chipWidth, CHIP_HEIGHT, CHIP_HEIGHT / 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(truncateText(ctx, move, chipWidth - 16), left + chipWidth / 2, y + CHIP_HEIGHT / 2 + 1);
    left += chipWidth + CHIP_GAP;
  });
}

/** A weakness: the type and multiplier, then a labeled line of Pokémon with their pictures, and one of moves as chips. */
function drawWeakness(ctx: SKRSContext2D, weakness: MatchupCardWeakness, labels: MatchupCardData['labels'], y: number) {
  const rowHeight = WEAK_ROW_HEIGHT - 8;
  ctx.fillStyle = withAlpha(weakness.type.color, 0.1);
  ctx.beginPath();
  ctx.roundRect(PADDING, y, WIDTH - PADDING * 2, rowHeight, 12);
  ctx.fill();

  const centerY = y + rowHeight / 2;
  drawTypeBadge(ctx, weakness.type, PADDING + 14, centerY - BADGE_HEIGHT / 2, BADGE_HEIGHT, BADGE_WIDTH);
  drawMultiplier(ctx, weakness.multiplier, PADDING + 14 + BADGE_WIDTH + 14, centerY);

  const labelX = PADDING + 14 + BADGE_WIDTH + 70;
  const examplesX = labelX + EXAMPLE_LABEL_WIDTH;
  const examplesWidth = WIDTH - PADDING - 14 - examplesX;

  const imageY = y + 10;
  drawExampleLabel(ctx, labels.pokemon, labelX, imageY + EXAMPLE_SIZE / 2);
  const slot = examplesWidth / Math.max(weakness.pokemon.length, 1);
  weakness.pokemon.forEach((pokemon, index) => {
    const x = examplesX + index * slot;
    ctx.fillStyle = withAlpha(weakness.type.color, 0.22);
    ctx.beginPath();
    ctx.arc(x + EXAMPLE_SIZE / 2, imageY + EXAMPLE_SIZE / 2, EXAMPLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    if (pokemon.image) drawContained(ctx, pokemon.image, x + 2, imageY + 2, EXAMPLE_SIZE - 4);
    ctx.font = 'bold 15px "Roboto", "EmojiFallback"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(truncateText(ctx, pokemon.name, slot - EXAMPLE_SIZE - 16), x + EXAMPLE_SIZE + 8, imageY + EXAMPLE_SIZE / 2 + 1);
  });

  const chipsY = imageY + EXAMPLE_SIZE + 6;
  if (weakness.moves.length > 0) {
    drawExampleLabel(ctx, labels.moves, labelX, chipsY + CHIP_HEIGHT / 2);
    drawMoveChips(ctx, weakness.moves, weakness.type.color, examplesX, chipsY, examplesWidth);
  }
}

/** Types with their multiplier, a few to a row. */
function drawEntries(ctx: SKRSContext2D, entries: MatchupCardEntry[], y: number) {
  const columnWidth = (WIDTH - PADDING * 2) / ENTRY_COLUMNS;
  entries.forEach((entry, index) => {
    const x = PADDING + (index % ENTRY_COLUMNS) * columnWidth;
    const rowY = y + Math.floor(index / ENTRY_COLUMNS) * ENTRY_ROW_HEIGHT;
    drawTypeBadge(ctx, entry.type, x, rowY, BADGE_HEIGHT, BADGE_WIDTH);
    drawMultiplier(ctx, entry.multiplier, x + BADGE_WIDTH + 14, rowY + BADGE_HEIGHT / 2);
  });
}

const entriesHeight = (count: number) => Math.ceil(count / ENTRY_COLUMNS) * ENTRY_ROW_HEIGHT;

/**
 * Draw what a Pokémon is weak to, with Pokémon and moves to use against it, and what it resists and can't be hurt by.
 * The labels are passed in already translated.
 * @returns The card as a PNG.
 */
export function renderMatchupCard(data: MatchupCardData): Buffer {
  const sections = [
    {
      label: data.labels.weak,
      height: data.weak.length * WEAK_ROW_HEIGHT,
      draw: (y: number) => data.weak.forEach((weakness, index) => drawWeakness(ctx, weakness, data.labels, y + index * WEAK_ROW_HEIGHT)),
    },
    { label: data.labels.resists, height: entriesHeight(data.resists.length), draw: (y: number) => drawEntries(ctx, data.resists, y) },
    { label: data.labels.immune, height: entriesHeight(data.immune.length), draw: (y: number) => drawEntries(ctx, data.immune, y) },
  ].filter((section) => section.height > 0);

  const height = HEADER_HEIGHT + sections.reduce((sum, section) => sum + SECTION_LABEL_HEIGHT + section.height + SECTION_GAP, 0) + FOOTER_HEIGHT;
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  const color = data.types[0]?.color ?? '#a8a77a';

  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, height, 16);
  ctx.fill();

  // The Pokémon on a soft circle in its type's color, with its name and types
  const artworkY = (HEADER_HEIGHT - ARTWORK_SIZE) / 2;
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.beginPath();
  ctx.arc(PADDING + ARTWORK_SIZE / 2, artworkY + ARTWORK_SIZE / 2, ARTWORK_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  if (data.artwork) drawContained(ctx, data.artwork, PADDING + 6, artworkY + 6, ARTWORK_SIZE - 12);

  const contentX = PADDING + ARTWORK_SIZE + 32;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.font = 'bold 18px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.title.toUpperCase(), WIDTH - PADDING, 72);
  const titleWidth = ctx.measureText(data.title.toUpperCase()).width;

  ctx.textAlign = 'left';
  ctx.font = 'bold 34px "Roboto", "EmojiFallback"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(truncateText(ctx, data.name, WIDTH - PADDING - contentX - titleWidth - 20), contentX, 72);
  let badgeX = contentX;
  for (const type of data.types) badgeX += drawTypeBadge(ctx, type, badgeX, 90, BADGE_HEIGHT) + 10;

  let y = HEADER_HEIGHT;
  for (const section of sections) {
    drawSectionLabel(ctx, section.label, y);
    section.draw(y + SECTION_LABEL_HEIGHT);
    y += SECTION_LABEL_HEIGHT + section.height + SECTION_GAP;
  }

  ctx.font = '14px "Roboto"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(truncateText(ctx, data.note, WIDTH - PADDING * 2), PADDING, y + FOOTER_HEIGHT / 2 - 4);

  return canvas.toBuffer('image/png');
}
