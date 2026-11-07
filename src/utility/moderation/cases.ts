import {
  ActionRowBuilder,
  type AnySelectMenuInteraction,
  bold,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  type Guild,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  subtext,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
} from 'discord.js';

import {
  CASE_SORTS,
  CASE_TYPES,
  type CaseSort,
  createCase,
  deleteCase,
  getCase,
  getRelatedCases,
  getUserCases,
  setCaseEnd,
  setCaseReason,
  undoCase,
} from 'database/moderation';
import { getReminderTimezone } from 'database/reminders';

import type { ModCase } from 'generated/prisma/client';
import { DiscordLimits } from 'utility/discordLimits';
import { buttonIcon, textIcon } from 'utility/emojis';
import { getTranslate, type Translate } from 'utility/i18next';
import { userRef, when } from 'utility/logs/format';
import { buildTextModal } from 'utility/modal';
import { canChangeEnd, END_NOW, type EndError, parseNewEnd } from 'utility/moderation/end';
import {
  auditReason,
  buildCaseDm,
  CASE_ICONS,
  caseNumber,
  formatUntil,
  MAX_BAN_DAYS,
  MAX_REASON_LENGTH,
  MAX_TIMEOUT_DAYS,
  moderationProblem,
} from 'utility/moderation/run';
import { buildPageModal, buildPageRow, clampPage, type PageButton, readPageInput } from 'utility/pagination';
import { sendError, withNotice, type ResponsePayload } from 'utility/response';
import { quote, shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/**
 * Someone's case history, from `/cases` or the Cases menu on their name. Every button, select and popup carries where it is in it,
 * as `cases:<action>:...`, so they work however old the message is:
 * - `list:<user>:<sort>:<page>`, with `first`, `last` or `goto` after it for those page buttons, as they can lead to the same page
 * - `view`, `reason`, `end`, `delete` and `deleteYes`, each `:<case>:<user>:<sort>:<page>`, to go back to the same page
 * - the selects `sort:<user>` and `pick:<user>:<sort>:<page>`, and the page popup `goto:<user>:<sort>`
 */
export const CASES_PREFIX = 'cases:';
/** How many cases a page shows. Each takes a few lines, so fewer than on other lists. */
export const CASES_PAGE_SIZE = 5;
/** How much of a reason the list shows. The whole reason is in the case's own view. */
const LIST_REASON_LENGTH = 100;
const REASON_INPUT_ID = 'reason';
const END_INPUT_ID = 'end';
const END_REASON_INPUT_ID = 'end-reason';

/** Where someone is in a case history, which every button, select and popup carries. */
export interface CasesState {
  userId: string;
  sort: CaseSort;
  page: number;
}

/** What a custom ID of a case history asks for. */
export type CasesAction =
  | { action: 'list'; state: CasesState; goto: boolean }
  | { action: 'view' | 'reason' | 'end' | 'delete' | 'deleteYes'; caseId: string; state: CasesState }
  | { action: 'sort'; userId: string }
  | { action: 'pick'; state: CasesState }
  | { action: 'goto'; userId: string; sort: CaseSort };

const stateId = (state: CasesState) => `${state.userId}:${state.sort}:${state.page}`;
export const listId = (state: CasesState, suffix?: 'first' | 'last' | 'goto') => `${CASES_PREFIX}list:${stateId(state)}${suffix ? `:${suffix}` : ''}`;
const caseId = (action: 'view' | 'reason' | 'end' | 'delete' | 'deleteYes', id: string, state: CasesState) =>
  `${CASES_PREFIX}${action}:${id}:${stateId(state)}`;

const isId = (value: string | undefined): value is string => /^\d{15,25}$/.test(value ?? '');
const isSort = (value: string | undefined): value is CaseSort => CASE_SORTS.includes(value as CaseSort);
const isPage = (value: string | undefined) => /^\d{1,6}$/.test(value ?? '');

/** Where a custom ID of a case history leads, or null if it isn't one, like one from an older version of the bot. */
export function parseCasesId(customId: string): CasesAction | null {
  if (!customId.startsWith(CASES_PREFIX)) return null;
  const [action, ...parts] = customId.slice(CASES_PREFIX.length).split(':');
  const state = (userId?: string, sort?: string, page?: string): CasesState | null =>
    isId(userId) && isSort(sort) && isPage(page) ? { userId, sort, page: Number(page) } : null;

  switch (action) {
    case 'list': {
      const [userId, sort, page, suffix] = parts;
      const parsed = state(userId, sort, page);
      if (!parsed || parts.length > 4 || (suffix !== undefined && !['first', 'last', 'goto'].includes(suffix))) return null;
      return { action, state: parsed, goto: suffix === 'goto' };
    }
    case 'view':
    case 'reason':
    case 'end':
    case 'delete':
    case 'deleteYes': {
      const [id, userId, sort, page] = parts;
      const parsed = state(userId, sort, page);
      if (!parsed || !id || parts.length !== 4) return null;
      return { action, caseId: id, state: parsed };
    }
    case 'sort':
      return parts.length === 1 && isId(parts[0]) ? { action, userId: parts[0] } : null;
    case 'pick': {
      const parsed = state(parts[0], parts[1], parts[2]);
      return parsed && parts.length === 3 ? { action, state: parsed } : null;
    }
    case 'goto': {
      const [userId, sort] = parts;
      return parts.length === 2 && isId(userId) && isSort(sort) ? { action, userId, sort } : null;
    }
    default:
      return null;
  }
}

/** A case's type with its icon, like `Ban`. */
const typeLabel = (modCase: ModCase, t: Translate) => `${textIcon(CASE_ICONS[modCase.type])} ${t(`moderation.types.${modCase.type}`)}`;

/** Whether a timeout or ban is still on, was ended early, or ran out, with when. Null for cases that don't last, and bans for good that are still on. */
function caseStatus(modCase: ModCase, t: Translate, now = new Date()): string | null {
  if (modCase.endedAt) return t('moderation.cases.status.ended', { time: when(modCase.endedAt) });
  if (!modCase.expiresAt) return null;
  return modCase.expiresAt > now
    ? t('moderation.cases.status.until', { time: when(modCase.expiresAt) })
    : t('moderation.cases.status.ranOut', { time: when(modCase.expiresAt) });
}

const moderatorOf = (guild: Guild, modCase: ModCase, t: Translate) =>
  modCase.moderatorId ? userRef(guild, modCase.moderatorId) : t('moderation.cases.unknown');

/** A page of someone's cases, with how many of each type they have above them. */
export async function renderCaseList(guild: Guild, requested: CasesState, t: Translate): Promise<ResponsePayload> {
  const first = await getUserCases(guild.id, requested.userId, requested.sort, requested.page * CASES_PAGE_SIZE, CASES_PAGE_SIZE);
  const { page, pages } = clampPage(requested.page, first.total, CASES_PAGE_SIZE);
  // Asked again when the page asked for doesn't exist anymore, like after cases were deleted
  const { cases, counts, total } =
    page === requested.page ? first : await getUserCases(guild.id, requested.userId, requested.sort, page * CASES_PAGE_SIZE, CASES_PAGE_SIZE);
  const state: CasesState = { ...requested, page };

  // How many there are, and of which types, under the title, where they don't run into the first case
  const count = [
    t('moderation.cases.count', { count: total }),
    ...CASE_TYPES.filter((type) => counts[type] > 0).map((type) => t(`moderation.cases.counts.${type}`, { count: counts[type] })),
  ].join(' · ');
  const title = t('moderation.cases.title', { user: userRef(guild, requested.userId) });
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(total > 0 ? `${title}\n${subtext(count)}` : title))
    // Large, so the title, the list and the selects stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  if (total === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('moderation.cases.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  // The case and its type, then small under it, each on a line of its own: why, by whom, when, and until when
  const entries = cases.map((modCase) => {
    const details = [
      t('moderation.cases.entryReason', { reason: shorten((modCase.reason ?? t('moderation.noReason')).replace(/\s+/g, ' '), LIST_REASON_LENGTH) }),
      t('moderation.cases.entryBy', { moderator: moderatorOf(guild, modCase, t) }),
      t('moderation.cases.entryCreated', { time: when(modCase.createdAt) }),
      caseStatus(modCase, t),
    ];
    const heading = t('moderation.cases.entry', { number: caseNumber(modCase, t), type: typeLabel(modCase, t) });
    return [heading, ...details.filter((detail): detail is string => detail !== null).map((detail) => subtext(detail))].join('\n');
  });

  const sortSelect = new StringSelectMenuBuilder().setCustomId(`${CASES_PREFIX}sort:${state.userId}`).addOptions(
    CASE_SORTS.map((sort) =>
      new StringSelectMenuOptionBuilder()
        .setValue(sort)
        .setLabel(t(`moderation.cases.sort.${sort}`))
        .setEmoji(buttonIcon(sort === 'oldest' ? 'arrow-up-narrow-wide' : sort === 'newest' ? 'arrow-down-wide-narrow' : 'tag'))
        .setDefault(sort === state.sort),
    ),
  );
  const pickSelect = new StringSelectMenuBuilder()
    .setCustomId(`${CASES_PREFIX}pick:${stateId(state)}`)
    .setPlaceholder(t('moderation.cases.pick'))
    .addOptions(
      cases.map((modCase) =>
        new StringSelectMenuOptionBuilder()
          .setValue(modCase.id)
          .setLabel(shorten(`${caseNumber(modCase, t)} ${t(`moderation.types.${modCase.type}`)}`, DiscordLimits.optionLabelLength))
          .setEmoji(buttonIcon(CASE_ICONS[modCase.type]))
          .setDescription(shorten((modCase.reason ?? t('moderation.noReason')).replace(/\s+/g, ' '), DiscordLimits.optionLabelLength)),
      ),
    );

  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(entries.join('\n\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sortSelect),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pickSelect),
    );
  if (pages > 1) {
    const customId = (button: PageButton, target: number) =>
      listId({ ...state, page: target }, button === 'first' || button === 'last' || button === 'goto' ? button : undefined);
    container.addActionRowComponents(buildPageRow(page, pages, customId, t));
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** How a related case is related to one: whether it ended that one, or that one ended it. */
const endedThis = (related: ModCase, modCase: ModCase) => modCase.endedAt !== null && related.createdAt.getTime() === modCase.endedAt.getTime();

/**
 * One case with everything about it and the cases related to it, like the timeout a removed timeout ended, with buttons to go back to the
 * list, change its reason or when it ends, or delete it, and to open the related ones.
 */
export function renderCase(guild: Guild, modCase: ModCase, related: ModCase[], state: CasesState, t: Translate): ResponsePayload {
  const field = (label: string, value: string) => `${bold(label)}\n${value}`;
  const fields = [
    t('moderation.cases.view.title', { number: caseNumber(modCase, t), type: typeLabel(modCase, t) }),
    field(t('moderation.cases.view.member'), userRef(guild, modCase.userId)),
    field(t('moderation.cases.view.moderator'), moderatorOf(guild, modCase, t)),
    field(t('moderation.reason'), quote(modCase.reason ?? t('moderation.noReason'))),
    field(t('moderation.cases.view.date'), when(modCase.createdAt)!),
  ];
  if (modCase.endedAt) fields.push(field(t('moderation.cases.view.ended'), when(modCase.endedAt)!));
  else if (modCase.expiresAt)
    fields.push(field(t(modCase.expiresAt > new Date() ? 'moderation.cases.view.until' : 'moderation.cases.view.ranOut'), when(modCase.expiresAt)!));
  if (related.length > 0) {
    const lines = related.map((other) =>
      t(endedThis(other, modCase) ? 'moderation.cases.view.relatedEndedThis' : 'moderation.cases.view.relatedEndedByThis', {
        case: `${bold(caseNumber(other, t))} ${typeLabel(other, t)}`,
        time: time(other.createdAt, TimestampStyles.RelativeTime),
      }),
    );
    fields.push(field(t('moderation.cases.view.related'), lines.join('\n')));
  }

  const button = (customId: string, label: string, icon: Parameters<typeof buttonIcon>[0], style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(buttonIcon(icon)).setStyle(style);
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(fields.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(listId(state), t('moderation.cases.view.back'), 'chevron-left'),
        button(caseId('reason', modCase.id, state), t('moderation.cases.view.editReason'), 'pencil'),
        // Only while it runs, as a timeout or ban that ended is over
        ...(canChangeEnd(modCase) ? [button(caseId('end', modCase.id, state), t('moderation.cases.view.changeEnd'), 'clock')] : []),
        button(caseId('delete', modCase.id, state), t('moderation.cases.view.delete'), 'trash-2', ButtonStyle.Danger),
      ),
    );
  // A button to open each related case, on a row of their own under the case's own buttons
  if (related.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        related.map((other) =>
          button(caseId('view', other.id, state), t('moderation.cases.view.open', { number: caseNumber(other, t) }), CASE_ICONS[other.type]),
        ),
      ),
    );
  }
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** One case with the cases related to it, which are looked up for it. */
const renderCaseView = async (guild: Guild, modCase: ModCase, state: CasesState, t: Translate) =>
  renderCase(guild, modCase, await getRelatedCases(modCase), state, t);

/** The question whether to delete a case, as it can't be undone. */
function renderDeleteQuestion(modCase: ModCase, state: CasesState, t: Translate): ResponsePayload {
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.warning)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('moderation.cases.delete.question', { number: caseNumber(modCase, t) })))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(caseId('deleteYes', modCase.id, state))
          .setLabel(t('moderation.cases.delete.confirm'))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(caseId('view', modCase.id, state))
          .setLabel(t('moderation.cases.delete.cancel'))
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

/** The list again with a note above it, for a case that was deleted, meanwhile or just now. */
const listWithNotice = async (guild: Guild, state: CasesState, notice: string, kind: 'success' | 'info', t: Translate) =>
  withNotice(notice, kind, await renderCaseList(guild, state, t));

/** The case a button is about, or the list again saying it's gone, as someone may have deleted it meanwhile. */
async function caseOrGone(interaction: ButtonInteraction<'cached'> | ModalSubmitInteraction<'cached'>, id: string, state: CasesState, t: Translate) {
  const modCase = await getCase(interaction.guildId, id);
  if (!modCase) await interaction.editReply(await listWithNotice(interaction.guild, state, t('moderation.cases.gone'), 'info', t));
  return modCase;
}

/** The buttons of a case history: pages, a case's view, and changing or deleting it. */
export async function handleCasesButton(interaction: ButtonInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseCasesId(interaction.customId);
  if (!parsed || !('state' in parsed)) return sendError(interaction, t('system.outdated'));
  const { state } = parsed;

  // Popups have to be the first answer, so these can't wait for anything else
  if (parsed.action === 'list' && parsed.goto) {
    return interaction.showModal(buildPageModal(`${CASES_PREFIX}goto:${state.userId}:${state.sort}`, state.page + 1, t));
  }
  if (parsed.action === 'reason') {
    const modCase = await getCase(interaction.guildId, parsed.caseId);
    if (!modCase) return sendError(interaction, t('moderation.cases.gone'));
    return interaction.showModal(
      buildTextModal({
        customId: caseId('reason', modCase.id, state),
        title: t('moderation.cases.reasonModal.title', { number: caseNumber(modCase, t) }),
        label: t('moderation.reason'),
        inputId: REASON_INPUT_ID,
        placeholder: t('moderation.cases.reasonModal.placeholder'),
        value: modCase.reason ?? undefined,
        maxLength: MAX_REASON_LENGTH,
        optional: true,
        paragraph: true,
      }),
    );
  }

  if (parsed.action === 'end') {
    const modCase = await getCase(interaction.guildId, parsed.caseId);
    if (!modCase) return sendError(interaction, t('moderation.cases.gone'));
    if (!canChangeEnd(modCase)) return sendError(interaction, t('moderation.cases.endModal.notRunning'));
    return interaction.showModal(buildEndModal(modCase, state, t));
  }

  // Answered before anything is looked up, as Discord gives up after 3 seconds
  await interaction.deferUpdate();
  switch (parsed.action) {
    case 'list':
      return interaction.editReply(await renderCaseList(interaction.guild, state, t));
    case 'view': {
      const modCase = await caseOrGone(interaction, parsed.caseId, state, t);
      return modCase && interaction.editReply(await renderCaseView(interaction.guild, modCase, state, t));
    }
    case 'delete': {
      const modCase = await caseOrGone(interaction, parsed.caseId, state, t);
      return modCase && interaction.editReply(renderDeleteQuestion(modCase, state, t));
    }
    case 'deleteYes': {
      const modCase = await caseOrGone(interaction, parsed.caseId, state, t);
      if (!modCase) return;
      await deleteCase(interaction.guildId, modCase.id);
      const notice = t('moderation.cases.delete.done', { number: caseNumber(modCase, t) });
      return interaction.editReply(await listWithNotice(interaction.guild, state, notice, 'success', t));
    }
  }
}

/** The selects of a case history: how it's sorted, and which case to look at. */
export async function handleCasesSelect(interaction: AnySelectMenuInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseCasesId(interaction.customId);
  const value = interaction.values[0] ?? '';
  if (!parsed || (parsed.action !== 'sort' && parsed.action !== 'pick')) return sendError(interaction, t('system.outdated'));

  await interaction.deferUpdate();
  if (parsed.action === 'sort') {
    // Back to the first page, as the cases on the page asked for would be others now
    const sort = isSort(value) ? value : 'newest';
    return interaction.editReply(await renderCaseList(interaction.guild, { userId: parsed.userId, sort, page: 0 }, t));
  }
  const modCase = await getCase(interaction.guildId, value);
  if (!modCase) return interaction.editReply(await listWithNotice(interaction.guild, parsed.state, t('moderation.cases.gone'), 'info', t));
  return interaction.editReply(await renderCaseView(interaction.guild, modCase, parsed.state, t));
}

/** The popups of a case history: which page to go to, and a case's new reason. */
export async function handleCasesModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseCasesId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild() || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));

  if (parsed.action === 'goto') {
    const page = readPageInput(interaction);
    if (page === null) return sendError(interaction, t('pagination.modal.invalid'));
    await interaction.deferUpdate();
    // A page past the end shows the last one
    return interaction.editReply(await renderCaseList(interaction.guild, { userId: parsed.userId, sort: parsed.sort, page: page - 1 }, t));
  }
  if (parsed.action === 'end') return changeEnd(interaction, parsed.caseId, parsed.state, t);
  if (parsed.action !== 'reason') return sendError(interaction, t('system.outdated'));

  await interaction.deferUpdate();
  const reason = interaction.fields.getTextInputValue(REASON_INPUT_ID).trim() || null;
  if (!(await setCaseReason(interaction.guildId, parsed.caseId, reason))) {
    return interaction.editReply(await listWithNotice(interaction.guild, parsed.state, t('moderation.cases.gone'), 'info', t));
  }
  const modCase = await caseOrGone(interaction, parsed.caseId, parsed.state, t);
  return (
    modCase &&
    interaction.editReply(withNotice(t('moderation.cases.reasonModal.done'), 'success', await renderCaseView(interaction.guild, modCase, parsed.state, t)))
  );
}

/** The popup asking when a timeout or ban ends, and why, for when it ends it right away, which makes a case of its own. */
function buildEndModal(modCase: ModCase, state: CasesState, t: Translate): ModalBuilder {
  const end = new TextInputBuilder()
    .setCustomId(END_INPUT_ID)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(50)
    .setRequired(true)
    .setPlaceholder(t(modCase.type === 'ban' ? 'moderation.cases.endModal.placeholderBan' : 'moderation.cases.endModal.placeholderTimeout'));
  const reason = new TextInputBuilder().setCustomId(END_REASON_INPUT_ID).setStyle(TextInputStyle.Paragraph).setMaxLength(MAX_REASON_LENGTH).setRequired(false);
  return new ModalBuilder()
    .setCustomId(caseId('end', modCase.id, state))
    .setTitle(t('moderation.cases.endModal.title', { number: caseNumber(modCase, t) }).slice(0, DiscordLimits.modalTitleLength))
    .addLabelComponents(
      new LabelBuilder().setLabel(t('moderation.cases.endModal.label')).setTextInputComponent(end),
      new LabelBuilder()
        .setLabel(t('moderation.cases.endModal.reasonLabel'))
        .setDescription(t('moderation.cases.endModal.reasonDescription'))
        .setTextInputComponent(reason),
    );
}

/**
 * End a running timeout or ban right away, from the popup: take the timeout away or lift the ban on Discord, as a case of its own with the
 * reason given, like `/untimeout` and `/unban` do. The case is made first, so the logs find it, and taken back if Discord says no.
 */
async function endNow(interaction: ModalSubmitInteraction<'cached'>, modCase: ModCase, state: CasesState, t: Translate): Promise<unknown> {
  const { guild } = interaction;
  const reason = interaction.fields.getTextInputValue(END_REASON_INPUT_ID).trim() || null;
  const type = modCase.type === 'ban' ? 'unban' : 'untimeout';

  let act: (auditReason: string) => Promise<unknown>;
  if (type === 'unban') {
    if (!interaction.member.permissions.has('BanMembers')) return sendError(interaction, t('moderation.cases.endModal.noBanPermission'));
    act = (audit) => guild.members.unban(modCase.userId, audit);
  } else {
    const member = await guild.members.fetch(modCase.userId).catch(() => null);
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(guild, interaction.member, member.user, member, 'untimeout', t);
    if (problem) return sendError(interaction, problem);
    act = (audit) => member.timeout(null, audit);
  }

  const lifted = await createCase({ guildId: guild.id, type, userId: modCase.userId, moderatorId: interaction.user.id, reason });
  try {
    await act(auditReason(interaction.user, reason));
  } catch {
    await undoCase(lifted);
    return sendError(interaction, t('moderation.failed'));
  }
  // Told by DM like with /untimeout. Someone unbanned rarely shares a server with the bot to get one, like with /unban
  if (type === 'untimeout') {
    const user = await interaction.client.users.fetch(modCase.userId).catch(() => null);
    await user?.send(buildCaseDm(guild, lifted, getTranslate(guild.preferredLocale))).catch(() => null);
  }

  const ended = (await getCase(guild.id, modCase.id)) ?? { ...modCase, endedAt: lifted.createdAt };
  const notice = t('moderation.cases.endModal.doneNow', { number: caseNumber(lifted, t) });
  return interaction.editReply(withNotice(notice, 'success', await renderCaseView(guild, ended, state, t)));
}

/** Why a new end can't be used, for the one who typed it. */
function endProblem(error: EndError, type: 'timeout' | 'ban', t: Translate): string {
  if (error === 'tooLong') {
    return type === 'timeout' ? t('moderation.problems.timeoutTooLong', { max: MAX_TIMEOUT_DAYS }) : t('moderation.problems.banTooLong');
  }
  return t(`moderation.cases.endModal.${error}`, { max: MAX_TIMEOUT_DAYS, years: MAX_BAN_DAYS / 365 });
}

/**
 * Change when a running timeout or ban ends, from the popup. A timeout is changed on Discord too, which also checks the member can still
 * be timed out by whoever changes it. A ban's end is only the bot's, which lifts it then, so changing it needs the right to ban.
 */
async function changeEnd(interaction: ModalSubmitInteraction<'cached'>, id: string, state: CasesState, t: Translate): Promise<unknown> {
  await interaction.deferUpdate();
  const modCase = await caseOrGone(interaction, id, state, t);
  if (!modCase) return;
  if (!canChangeEnd(modCase) || (modCase.type !== 'timeout' && modCase.type !== 'ban'))
    return sendError(interaction, t('moderation.cases.endModal.notRunning'));
  const type = modCase.type;

  // Dates are in the timezone the moderator picked for their reminders, or UTC. Discord shows the result in everyone's own time
  const timezone = (await getReminderTimezone(interaction.user.id)) ?? 'UTC';
  const end = parseNewEnd(interaction.fields.getTextInputValue(END_INPUT_ID), type, modCase.expiresAt, timezone);
  if (end === END_NOW) return endNow(interaction, modCase, state, t);
  if (typeof end === 'string') return sendError(interaction, endProblem(end, type, t));

  const reason = auditReason(interaction.user, t('moderation.cases.endModal.audit', { number: caseNumber(modCase, t) }));
  if (type === 'ban') {
    if (!interaction.member.permissions.has('BanMembers')) return sendError(interaction, t('moderation.cases.endModal.noBanPermission'));
  } else {
    const member = await interaction.guild.members.fetch(modCase.userId).catch(() => null);
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(interaction.guild, interaction.member, member.user, member, 'timeout', t);
    if (problem) return sendError(interaction, problem);
    try {
      await member.disableCommunicationUntil(end, reason);
    } catch {
      return sendError(interaction, t('moderation.failed'));
    }
  }

  if (!(await setCaseEnd(interaction.guildId, modCase.id, end))) return sendError(interaction, t('moderation.cases.endModal.notRunning'));
  const notice = end
    ? t('moderation.cases.endModal.done', { number: caseNumber(modCase, t), until: formatUntil(end) })
    : t('moderation.cases.endModal.doneNever', { number: caseNumber(modCase, t) });
  return interaction.editReply(withNotice(notice, 'success', await renderCaseView(interaction.guild, { ...modCase, expiresAt: end }, state, t)));
}

/** Someone's case history from its first page, newest first, for `/cases` and the Cases menu on their name. */
export const renderCasesFor = (guild: Guild, userId: string, t: Translate) => renderCaseList(guild, { userId, sort: 'newest', page: 0 }, t);
