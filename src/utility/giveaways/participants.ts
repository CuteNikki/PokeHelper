import {
  ActionRowBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  ContainerBuilder,
  MessageFlags,
  type ModalSubmitInteraction,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import {
  getAllWinners,
  getGiveaway,
  getParticipantPosition,
  getParticipants,
  type Giveaway,
  PARTICIPANT_SORTS,
  type ParticipantSort,
} from 'database/giveaways';

import { formatNumber } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import type { IconName } from 'utility/icons';
import { getTranslate, type Translate } from 'utility/i18next';
import { buildPageModal, buildPageRow, clampPage, findMeButton, pageOfPosition, type PageButton, readPageInput } from 'utility/pagination';
import { createResponse, type ResponsePayload, sendError } from 'utility/response';
import { shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/**
 * Custom IDs of the participants list, after this:
 * - `open:<giveaway>` on the post, which shows the list
 * - `list:<giveaway>:<sort>:<page>`, with `first`, `last` or `goto` after it for those page buttons, as they can lead to the same page
 * - `me:<giveaway>:<sort>`, the select `sort:<giveaway>`, and the page popup `goto:<giveaway>:<sort>`
 */
export const PARTICIPANTS_PREFIX = 'gwp:';
const PAGE_SIZE = 10;
const SORT_ICONS: Record<ParticipantSort, IconName> = {
  joined: 'arrow-up-narrow-wide',
  newest: 'arrow-down-wide-narrow',
  most: 'trending-up',
  fewest: 'minus',
};

interface ListState {
  giveawayId: string;
  sort: ParticipantSort;
  /** Counted from 0. */
  page: number;
}

export const openParticipantsId = (giveawayId: string) => `${PARTICIPANTS_PREFIX}open:${giveawayId}`;
const listId = (state: ListState, suffix?: PageButton) =>
  `${PARTICIPANTS_PREFIX}list:${state.giveawayId}:${state.sort}:${state.page}${suffix ? `:${suffix}` : ''}`;

type Parsed =
  | { action: 'open'; giveawayId: string }
  | { action: 'list'; state: ListState; goto: boolean }
  | { action: 'me' | 'goto'; giveawayId: string; sort: ParticipantSort }
  | { action: 'sort'; giveawayId: string };

const isSort = (value: string | undefined): value is ParticipantSort => PARTICIPANT_SORTS.includes(value as ParticipantSort);
const isId = (value: string | undefined): value is string => !!value && /^[a-z0-9]+$/.test(value);

/** What a custom ID of the list says, or null if it's not one, like one from an older version. */
export function parseParticipantsId(customId: string): Parsed | null {
  if (!customId.startsWith(PARTICIPANTS_PREFIX)) return null;
  const [action, giveawayId, sort, page, suffix] = customId.slice(PARTICIPANTS_PREFIX.length).split(':');
  if (!isId(giveawayId)) return null;
  switch (action) {
    case 'open':
    case 'sort':
      return { action, giveawayId };
    case 'me':
    case 'goto':
      return isSort(sort) ? { action, giveawayId, sort } : null;
    case 'list':
      return isSort(sort) && /^\d+$/.test(page ?? '') ? { action, state: { giveawayId, sort, page: Number(page) }, goto: suffix === 'goto' } : null;
    default:
      return null;
  }
}

/**
 * The winners of an ended giveaway, and how many were replaced, or null before it ended. The ones replaced are only counted, as with
 * rerolls there can be many, more than fit in a message.
 */
async function winnersLine(giveaway: Giveaway, t: Translate): Promise<string | null> {
  if (giveaway.status !== 'ended') return null;
  const winners = await getAllWinners(giveaway.id);
  const current = winners.filter((winner) => !winner.replacedAt);
  const replaced = winners.length - current.length;
  if (current.length === 0 && replaced === 0) return t('giveaway.participants.noWinners');
  const names = current.map((winner) => (winner.userId ? userMention(winner.userId) : t('giveaway.participants.deletedUser')));
  if (replaced > 0) names.push(t('giveaway.participants.replaced', { count: replaced }));
  return t('giveaway.participants.winners', { winners: names.join(', '), count: current.length });
}

/** A page of a giveaway's participants, with selects and buttons to sort it, go through it and find yourself in it. */
export async function renderParticipants(giveaway: Giveaway, requested: ListState, t: Translate): Promise<ResponsePayload> {
  const first = await getParticipants(giveaway.id, requested.sort, requested.page * PAGE_SIZE, PAGE_SIZE);
  const { page, pages } = clampPage(requested.page, first.total, PAGE_SIZE);
  // Asked again when the page asked for doesn't exist anymore, like after people left
  const { participants, total, entries } = page === requested.page ? first : await getParticipants(giveaway.id, requested.sort, page * PAGE_SIZE, PAGE_SIZE);
  const state: ListState = { ...requested, page };

  const counts = [t('giveaway.participants.people', { count: total }), t('giveaway.participants.entries', { count: entries })].join(' · ');
  const header = [t('giveaway.participants.title'), subtext(`${shorten(giveaway.prize, 100)} · ${counts}`)];
  const winners = await winnersLine(giveaway, t);
  if (winners) header.push('', winners);
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header.join('\n')))
    // Large, so the title, the list and the buttons stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  if (total === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('giveaway.participants.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  const lines = participants.map((participant, index) =>
    [
      t('giveaway.participants.item', { position: formatNumber(page * PAGE_SIZE + index + 1, t), user: userMention(participant.userId) }),
      t('giveaway.participants.joined', { time: time(participant.createdAt, TimestampStyles.RelativeTime) }),
      // Only said for more than 1, which is what everyone has without bonus roles
      ...(participant.entries > 1 ? [t('giveaway.participants.entries', { count: participant.entries })] : []),
    ].join(' · '),
  );
  const sortSelect = new StringSelectMenuBuilder().setCustomId(`${PARTICIPANTS_PREFIX}sort:${giveaway.id}`).addOptions(
    PARTICIPANT_SORTS.map((sort) =>
      new StringSelectMenuOptionBuilder()
        .setValue(sort)
        .setLabel(t(`giveaway.participants.sort.${sort}`))
        .setEmoji(buttonIcon(SORT_ICONS[sort]))
        .setDefault(sort === state.sort),
    ),
  );

  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sortSelect));
  if (pages > 1) {
    const customId = (button: PageButton, target: number) =>
      listId({ ...state, page: target }, button === 'first' || button === 'last' || button === 'goto' ? button : undefined);
    container.addActionRowComponents(buildPageRow(page, pages, customId, t));
  }
  container.addActionRowComponents(
    new ActionRowBuilder<ReturnType<typeof findMeButton>>().addComponents(findMeButton(`${PARTICIPANTS_PREFIX}me:${giveaway.id}:${state.sort}`, t)),
  );
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

type ListInteraction = ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>;

/** The giveaway a list is of, or null after saying it's gone. Anyone can see the list of a giveaway on their server, also after it ended. */
async function giveawayOrGone(interaction: ListInteraction, giveawayId: string, t: Translate) {
  const giveaway = await getGiveaway(interaction.guildId, giveawayId);
  if (giveaway && giveaway.status !== 'draft') return giveaway;
  await interaction.editReply(createResponse(t('giveaway.join.gone'), 'error'));
  return null;
}

/** The buttons of a participants list: opening it from the post, its pages, and finding yourself in it. */
export async function handleParticipantsButton(interaction: ButtonInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseParticipantsId(interaction.customId);
  if (!parsed || parsed.action === 'sort' || parsed.action === 'goto') return sendError(interaction, t('system.outdated'));

  // A popup has to be the first answer
  if (parsed.action === 'list' && parsed.goto) {
    return interaction.showModal(buildPageModal(`${PARTICIPANTS_PREFIX}goto:${parsed.state.giveawayId}:${parsed.state.sort}`, parsed.state.page + 1, t));
  }

  // Opened from the post, which everyone sees, so the list is a reply only whoever pressed it sees. The others edit that reply
  if (parsed.action === 'open') await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  else await interaction.deferUpdate();

  const giveawayId = parsed.action === 'list' ? parsed.state.giveawayId : parsed.giveawayId;
  const giveaway = await giveawayOrGone(interaction, giveawayId, t);
  if (!giveaway) return;

  if (parsed.action === 'open') return interaction.editReply(await renderParticipants(giveaway, { giveawayId, sort: 'joined', page: 0 }, t));
  if (parsed.action === 'list') return interaction.editReply(await renderParticipants(giveaway, parsed.state, t));

  const position = await getParticipantPosition(giveaway.id, interaction.user.id, parsed.sort);
  if (position === null) return sendError(interaction, t('giveaway.participants.notIn'));
  return interaction.editReply(await renderParticipants(giveaway, { giveawayId, sort: parsed.sort, page: pageOfPosition(position, PAGE_SIZE) - 1 }, t));
}

/** The sort select of a participants list, which starts over on the first page. */
export async function handleParticipantsSelect(interaction: AnySelectMenuInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseParticipantsId(interaction.customId);
  const sort = interaction.values[0];
  if (parsed?.action !== 'sort' || !isSort(sort)) return sendError(interaction, t('system.outdated'));
  await interaction.deferUpdate();
  const giveaway = await giveawayOrGone(interaction, parsed.giveawayId, t);
  if (giveaway) await interaction.editReply(await renderParticipants(giveaway, { giveawayId: giveaway.id, sort, page: 0 }, t));
}

/** The popup asking which page of a participants list to go to. */
export async function handleParticipantsModal(interaction: ModalSubmitInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseParticipantsId(interaction.customId);
  if (parsed?.action !== 'goto' || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));
  const page = readPageInput(interaction);
  if (page === null) return sendError(interaction, t('pagination.modal.invalid'));
  await interaction.deferUpdate();
  const giveaway = await giveawayOrGone(interaction, parsed.giveawayId, t);
  if (giveaway) await interaction.editReply(await renderParticipants(giveaway, { giveawayId: giveaway.id, sort: parsed.sort, page: page - 1 }, t));
}
