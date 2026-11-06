import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';

import { drawContained, drawTypeBadge, truncateText, withAlpha } from 'utility/canvas';

export interface PokedexCardType {
  name: string;
  color: string;
  /** Drawn at the start of its badge, when there is one. */
  icon?: Image | null;
}

export interface PokedexCardEvolution {
  name: string;
  /** How it evolves from the one before, like `Level 16`, written small below its name. Null for the first. */
  how?: string | null;
  image: Image | null;
  /** The Pokémon the card is about, which is highlighted. */
  current: boolean;
}

export interface PokedexCardData {
  name: string;
  /** Like `#0025`. */
  number: string;
  /** The kind and rarity, like "Mouse Pokémon" or "New Species Pokémon · Mythical". */
  genus: string | null;
  artwork: Image | null;
  types: PokedexCardType[];
  stats: { label: string; value: number }[];
  totalLabel: string;
  /** The Pokédex text. */
  entry: string | null;
  /**
   * Rows of labeled values below the entry, like height, weight and abilities, then breeding. The last of a row gets the space
   * that's left.
   */
  details: { label: string; value: string }[][];
  /** The evolution chain by stage, branches side by side. Empty when it doesn't evolve. */
  evolution: PokedexCardEvolution[][];
  evolutionLabel: string;
}

const WIDTH = 880;
const PADDING = 32;
const TOP_HEIGHT = 360;
const EVOLUTION_HEIGHT = 190;
/** How they evolve is written below the names, in as many lines as it takes, which the card grows by. */
const EVOLUTION_HOW_LINE_HEIGHT = 14;
const EVOLUTION_HOW_GAP = 6;
/** More than any way to evolve takes, so the card can't grow without end. */
const EVOLUTION_HOW_MAX_LINES = 6;
const EVOLUTION_ARROW_WIDTH = 36;
const EVOLUTION_GAP = 8;
const ENTRY_FONT = '17px "Roboto"';
const ENTRY_LINE_HEIGHT = 25;
/** The most lines of Pokédex text, which is plenty for any of them. */
const ENTRY_MAX_LINES = 4;
const DETAILS_HEIGHT = 50;
/** The space between rows of details, so they don't run together. */
const DETAILS_ROW_GAP = 18;
const ARTWORK_SIZE = 260;
/** Bars are full at this value. A few Pokémon go higher, up to 255, but scaling to that makes nearly every bar look short. */
export const STAT_BAR_MAX = 200;

const COLORS = {
  cardBg: 'rgba(42, 43, 60, 0.85)',
  trackBg: '#1e1e2e',
  textWhite: '#ffffff',
  textGray: '#a6adc8',
  divider: 'rgba(255, 255, 255, 0.08)',
};

/** The base stats as bars in the type's color, with the total below. */
function drawStats(ctx: SKRSContext2D, data: PokedexCardData, color: string, x: number, y: number, width: number) {
  const rowHeight = 28;
  const labelWidth = 92;
  const valueWidth = 44;
  const barX = x + labelWidth + valueWidth + 14;
  const barWidth = x + width - barX;
  const barHeight = 12;

  ctx.textBaseline = 'middle';
  data.stats.forEach((stat, index) => {
    const rowY = y + index * rowHeight + rowHeight / 2;
    ctx.textAlign = 'left';
    ctx.font = '15px "Roboto"';
    ctx.fillStyle = COLORS.textGray;
    ctx.fillText(truncateText(ctx, stat.label, labelWidth - 6), x, rowY);
    ctx.textAlign = 'right';
    ctx.font = 'bold 16px "Roboto"';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(String(stat.value), x + labelWidth + valueWidth, rowY);

    ctx.fillStyle = COLORS.trackBg;
    ctx.beginPath();
    ctx.roundRect(barX, rowY - barHeight / 2, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(barX, rowY - barHeight / 2, Math.max(barHeight, barWidth * Math.min(stat.value / STAT_BAR_MAX, 1)), barHeight, barHeight / 2);
    ctx.fill();
  });

  const totalY = y + data.stats.length * rowHeight + rowHeight / 2;
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.totalLabel.toUpperCase(), x, totalY);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px "Roboto"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(String(data.stats.reduce((sum, stat) => sum + stat.value, 0)), x + labelWidth + valueWidth, totalY);
}

/** How big each Pokémon of the evolution chain is drawn, so even Eevee's eight fit in a row. */
function evolutionSize(data: PokedexCardData): number {
  const count = data.evolution.reduce((sum, stage) => sum + stage.length, 0);
  const arrows = data.evolution.length - 1;
  const available = WIDTH - PADDING * 2 - arrows * EVOLUTION_ARROW_WIDTH - (count - arrows - 1) * EVOLUTION_GAP;
  return Math.min(110, Math.floor(available / count));
}

/** How a Pokémon evolves, in lines as wide as it's drawn, in the font it's drawn in, which this sets. */
function howLines(ctx: SKRSContext2D, how: string, size: number): string[] {
  ctx.font = `${size < 90 ? 11 : 12}px "Roboto", "EmojiFallback"`;
  return wrapText(ctx, how, size + EVOLUTION_GAP, EVOLUTION_HOW_MAX_LINES);
}

/** The most lines any of the evolution chain needs for how it evolves. */
function mostHowLines(ctx: SKRSContext2D, data: PokedexCardData): number {
  const size = evolutionSize(data);
  return Math.max(0, ...data.evolution.flat().map((pokemon) => (pokemon.how ? howLines(ctx, pokemon.how, size).length : 0)));
}

/** The evolution chain in a row, with arrows between the stages, sized so even Eevee's eight fit. */
function drawEvolution(ctx: SKRSContext2D, data: PokedexCardData, color: string, y: number) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 13px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.evolutionLabel.toUpperCase(), PADDING, y + 24);

  const count = data.evolution.reduce((sum, stage) => sum + stage.length, 0);
  const arrows = data.evolution.length - 1;
  const arrowWidth = EVOLUTION_ARROW_WIDTH;
  const gap = EVOLUTION_GAP;
  const size = evolutionSize(data);
  const totalWidth = count * size + arrows * arrowWidth + (count - arrows - 1) * gap;

  const imageY = y + 40;
  let x = (WIDTH - totalWidth) / 2;
  data.evolution.forEach((stage, stageIndex) => {
    if (stageIndex > 0) {
      // Drawn as a chevron, as the bundled font has no arrow and it would show as a box
      const centerX = x + arrowWidth / 2;
      const centerY = imageY + size / 2;
      ctx.save();
      ctx.strokeStyle = COLORS.textGray;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(centerX - 4, centerY - 8);
      ctx.lineTo(centerX + 4, centerY);
      ctx.lineTo(centerX - 4, centerY + 8);
      ctx.stroke();
      ctx.restore();
      x += arrowWidth;
    }
    stage.forEach((pokemon, index) => {
      if (index > 0) x += gap;
      if (pokemon.current) {
        ctx.fillStyle = withAlpha(color, 0.22);
        ctx.beginPath();
        ctx.arc(x + size / 2, imageY + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pokemon.image) drawContained(ctx, pokemon.image, x + size * 0.08, imageY + size * 0.08, size * 0.84);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      // Names like Nidoran♀ need the fallback, Roboto has no ♀ and ♂
      ctx.font = `${pokemon.current ? 'bold ' : ''}${size < 90 ? 13 : 15}px "Roboto", "EmojiFallback"`;
      ctx.fillStyle = pokemon.current ? COLORS.textWhite : COLORS.textGray;
      ctx.fillText(truncateText(ctx, pokemon.name, size + gap), x + size / 2, imageY + size + 22);
      if (pokemon.how) {
        const lines = howLines(ctx, pokemon.how, size);
        ctx.fillStyle = COLORS.textGray;
        lines.forEach((line, lineIndex) => ctx.fillText(line, x + size / 2, imageY + size + 40 + lineIndex * EVOLUTION_HOW_LINE_HEIGHT));
      }
      x += size;
    });
  });
}

/** Text broken into lines that fit the width, in the context's current font. Past the most lines, the last ends in `...`. */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines - 1), truncateText(ctx, `${lines[maxLines - 1]} ${lines[maxLines]}`, maxWidth - 30)];
}

/** The height of the section with the Pokédex text and the details. */
const aboutHeight = (entryLines: number, detailRows: number) =>
  28 + entryLines * ENTRY_LINE_HEIGHT + (entryLines > 0 ? 16 : 0) + detailRows * DETAILS_HEIGHT + Math.max(0, detailRows - 1) * DETAILS_ROW_GAP + 20;

/** The Pokédex text, then the details side by side with their labels above. */
function drawAbout(ctx: SKRSContext2D, data: PokedexCardData, entryLines: string[], y: number) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = ENTRY_FONT;
  ctx.fillStyle = COLORS.textWhite;
  entryLines.forEach((line, index) => ctx.fillText(line, PADDING, y + 28 + 14 + index * ENTRY_LINE_HEIGHT));

  const detailsTop = y + 28 + entryLines.length * ENTRY_LINE_HEIGHT + (entryLines.length > 0 ? 16 : 0);
  data.details.forEach((row, rowIndex) => drawDetailRow(ctx, row, detailsTop + rowIndex * (DETAILS_HEIGHT + DETAILS_ROW_GAP)));
}

/** Labeled values side by side, each as wide as it needs, and the last as wide as what's left. */
function drawDetailRow(ctx: SKRSContext2D, row: { label: string; value: string }[], detailsY: number) {
  let x = PADDING;
  row.forEach((detail, index) => {
    const last = index === row.length - 1;
    ctx.font = 'bold 13px "Roboto"';
    const labelWidth = ctx.measureText(detail.label.toUpperCase()).width;
    ctx.font = '18px "Roboto", "EmojiFallback"';
    const width = last ? WIDTH - PADDING - x : Math.max(labelWidth, ctx.measureText(detail.value).width) + 48;

    ctx.font = 'bold 13px "Roboto"';
    ctx.fillStyle = COLORS.textGray;
    ctx.fillText(detail.label.toUpperCase(), x, detailsY + 14);
    ctx.font = '18px "Roboto", "EmojiFallback"';
    ctx.fillStyle = COLORS.textWhite;
    ctx.fillText(truncateText(ctx, detail.value, width), x, detailsY + 40);
    x += width;
  });
}

/**
 * Draw a Pokédex card: the artwork, name, number, kind and types, the base stats, the Pokédex text and details,
 * and the evolution chain with pictures. The labels are passed in already translated.
 * @returns The card as a PNG.
 */
export function renderPokedexCard(data: PokedexCardData): Buffer {
  const hasEvolution = data.evolution.length > 1;
  // The text is wrapped first, as the card's height depends on how many lines it takes
  const measure = createCanvas(1, 1).getContext('2d');
  measure.font = ENTRY_FONT;
  const entryLines = data.entry ? wrapText(measure, data.entry, WIDTH - PADDING * 2, ENTRY_MAX_LINES) : [];
  const aboutY = TOP_HEIGHT;
  const evolutionY = aboutY + aboutHeight(entryLines.length, data.details.length);
  const howLineCount = hasEvolution ? mostHowLines(measure, data) : 0;
  const howHeight = howLineCount > 0 ? EVOLUTION_HOW_GAP + howLineCount * EVOLUTION_HOW_LINE_HEIGHT : 0;
  const height = evolutionY + (hasEvolution ? EVOLUTION_HEIGHT + howHeight : 0);
  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  const color = data.types[0]?.color ?? '#a8a77a';

  // Card
  ctx.fillStyle = COLORS.cardBg;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, height, 16);
  ctx.fill();

  // Artwork on a soft circle in its type's color
  const artworkX = PADDING;
  const artworkY = (TOP_HEIGHT - ARTWORK_SIZE) / 2;
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.beginPath();
  ctx.arc(artworkX + ARTWORK_SIZE / 2, artworkY + ARTWORK_SIZE / 2, ARTWORK_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
  if (data.artwork) drawContained(ctx, data.artwork, artworkX + 10, artworkY + 10, ARTWORK_SIZE - 20);

  // Name and number
  const contentX = artworkX + ARTWORK_SIZE + 40;
  const contentWidth = WIDTH - PADDING - contentX;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  ctx.font = 'bold 22px "Roboto"';
  ctx.fillStyle = COLORS.textGray;
  ctx.fillText(data.number, WIDTH - PADDING, 60);
  const numberWidth = ctx.measureText(data.number).width;

  ctx.textAlign = 'left';
  ctx.font = 'bold 34px "Roboto", "EmojiFallback"';
  ctx.fillStyle = COLORS.textWhite;
  ctx.fillText(truncateText(ctx, data.name, contentWidth - numberWidth - 20), contentX, 60);

  if (data.genus) {
    ctx.font = '16px "Roboto"';
    ctx.fillStyle = COLORS.textGray;
    ctx.fillText(truncateText(ctx, data.genus, contentWidth), contentX, 88);
  }

  let badgeX = contentX;
  for (const type of data.types) badgeX += drawTypeBadge(ctx, type, badgeX, 102, 30) + 10;
  drawStats(ctx, data, color, contentX, 148, contentWidth);

  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(PADDING, aboutY, WIDTH - PADDING * 2, 1);
  drawAbout(ctx, data, entryLines, aboutY);

  if (hasEvolution) {
    ctx.fillStyle = COLORS.divider;
    ctx.fillRect(PADDING, evolutionY, WIDTH - PADDING * 2, 1);
    drawEvolution(ctx, data, color, evolutionY);
  }

  return canvas.toBuffer('image/png');
}
