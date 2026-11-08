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
} from 'discord.js';

import {
  CASE_SORTS,
  CASE_TYPES,
  type CaseSort,
  createCase,
  deleteCase,
  endCase,
  getCase,
  getRelatedCases,
  getUserCases,
  setCaseEnd,
  setCaseReason,
  undoCase,
} from 'database/moderation';
import { getReminderTimezone } from 'database/reminders';

import type { ModCase } from 'generated/prisma/client';
import { fetchMember } from 'utility/discord';
import { DiscordLimits } from 'utility/discordLimits';
import { DURATION_INPUT_LENGTH, SECOND } from 'utility/duration';
import { buttonIcon, textIcon } from 'utility/emojis';
import { getTranslate, type Translate } from 'utility/i18next';
import { userRef, userSubject, when } from 'utility/logs/format';
import { buildTextModal } from 'utility/modal';
import { canChangeEnd, END_NOW, type EndError, parseNewEnd } from 'utility/moderation/end';
import {
  auditReason,
  buildCaseDm,
  CASE_ICONS,
  caseNumber,
  fetchBanned,
  formatUntil,
  happenedAnyway,
  MAX_BAN_DAYS,
  MAX_REASON_LENGTH,
  MAX_TIMEOUT_DAYS,
  moderationProblem,
  MODERATOR_PERMISSIONS,
  oneAtATime,
  permissionProblem,
} from 'utility/moderation/run';
import { buildPageModal, buildPageRow, clampPage, type PageButton, readPageInput } from 'utility/pagination';
import { messageOf, quietMessageOf, type ResponsePayload, sendError, withNotice } from 'utility/response';
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

/** Where a custom ID of a case history leads, or null if it isn't one. */
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

  const count = [
    t('moderation.cases.count', { count: total }),
    ...CASE_TYPES.filter((type) => counts[type] > 0).map((type) => t(`moderation.cases.counts.${type}`, { count: counts[type] })),
  ].join(' · ');
  const title = t('moderation.cases.title', { user: userRef(guild, requested.userId) });
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(total > 0 ? `${title}\n${subtext(count)}` : title))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  if (total === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('moderation.cases.none')));
    return quietMessageOf(container);
  }

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
  return quietMessageOf(container);
}

/** How a related case is related to one: whether it ended that one, or that one ended it. */
const endedThis = (related: ModCase, modCase: ModCase) => modCase.endedAt !== null && related.createdAt.getTime() === modCase.endedAt.getTime();

/** One case with everything about it, buttons to change or delete it, and buttons to open its related cases. */
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
  const button = (customId: string, label: string, icon: Parameters<typeof buttonIcon>[0], style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(buttonIcon(icon)).setStyle(style);
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(fields.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  if (related.length > 0) {
    const entries = related.map((other) =>
      [
        t('moderation.cases.entry', { number: caseNumber(other, t), type: typeLabel(other, t) }),
        subtext(t(endedThis(other, modCase) ? 'moderation.cases.view.relatedEndedThis' : 'moderation.cases.view.relatedEndedByThis')),
        subtext(t('moderation.cases.entryCreated', { time: when(other.createdAt) })),
      ].join('\n'),
    );
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([bold(t('moderation.cases.view.related')), ...entries].join('\n')))
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          related.map((other) =>
            button(caseId('view', other.id, state), t('moderation.cases.view.open', { number: caseNumber(other, t) }), CASE_ICONS[other.type]),
          ),
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  }

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(listId(state), t('moderation.cases.view.back'), 'chevron-left'),
      button(caseId('reason', modCase.id, state), t('moderation.cases.view.editReason'), 'pencil'),
      // Only while it runs, as a timeout or ban that ended is over
      ...(canChangeEnd(modCase) ? [button(caseId('end', modCase.id, state), t('moderation.cases.view.changeEnd'), 'clock')] : []),
      button(caseId('delete', modCase.id, state), t('moderation.cases.view.delete'), 'trash-2', ButtonStyle.Danger),
    ),
  );
  return quietMessageOf(container);
}

const renderCaseView = async (guild: Guild, modCase: ModCase, state: CasesState, t: Translate) =>
  renderCase(guild, modCase, await getRelatedCases(modCase), state, t);

/** Whether a case is a temporary ban that's still on, which the bot lifts once it runs out, as long as its case is there. */
const isRunningTempBan = (modCase: ModCase) => modCase.type === 'ban' && !modCase.endedAt && modCase.expiresAt !== null;

function renderDeleteQuestion(modCase: ModCase, state: CasesState, t: Translate): ResponsePayload {
  const question = t('moderation.cases.delete.question', { number: caseNumber(modCase, t) });
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.warning)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(isRunningTempBan(modCase) ? `${question}\n${subtext(t('moderation.cases.delete.tempBanNote'))}` : question),
    )
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
  return messageOf(container);
}

const listWithNotice = async (guild: Guild, state: CasesState, notice: string, kind: 'success' | 'info', t: Translate) =>
  withNotice(notice, kind, await renderCaseList(guild, state, t));

/**
 * Why a moderator can't change or delete a case, or null if they can: not cases about themselves, or about members whose highest role
 * isn't below theirs, like for moderating them, and only with the permission its type needs, like Ban Members for a ban. The server's
 * owner can change any.
 */
async function changeProblem(interaction: ButtonInteraction<'cached'> | ModalSubmitInteraction<'cached'>, modCase: ModCase, t: Translate) {
  const { guild, member: moderator } = interaction;
  if (moderator.id === guild.ownerId) return null;
  if (modCase.userId === moderator.id) return t('moderation.cases.ownCase');
  const notAllowed = permissionProblem(moderator, MODERATOR_PERMISSIONS[modCase.type], t);
  if (notAllowed) return notAllowed;
  const member = await fetchMember(guild, modCase.userId);
  if (member === undefined) return t('moderation.problems.memberUnknown');
  if (member && member.roles.highest.comparePositionTo(moderator.roles.highest) >= 0) {
    return t('moderation.problems.aboveYou', { user: userSubject(member.user) });
  }
  return null;
}

/** The case a button is about, or the list again saying it's gone, as someone may have deleted it meanwhile. */
async function caseOrGone(interaction: ButtonInteraction<'cached'> | ModalSubmitInteraction<'cached'>, id: string, state: CasesState, t: Translate) {
  const modCase = await getCase(interaction.guildId, id);
  if (!modCase) await interaction.editReply(await listWithNotice(interaction.guild, state, t('moderation.cases.gone'), 'info', t));
  return modCase;
}

/** How long looking up a case for a popup may take, as Discord gives up on a popup after 3 seconds. This leaves time to say so instead. */
const POPUP_LOOKUP_LIMIT = 2 * SECOND;

/** The case a popup is about, null if it's gone, or 'slow' if looking it up took too long to still show a popup. */
async function caseForPopup(interaction: ButtonInteraction<'cached'>, id: string): Promise<ModCase | null | 'slow'> {
  const left = POPUP_LOOKUP_LIMIT - (Date.now() - interaction.createdTimestamp);
  return Promise.race([getCase(interaction.guildId, id), Bun.sleep(Math.max(left, 0)).then(() => 'slow' as const)]);
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
    const modCase = await caseForPopup(interaction, parsed.caseId);
    if (modCase === 'slow') return sendError(interaction, t('moderation.cases.slow'));
    if (!modCase) return sendError(interaction, t('moderation.cases.gone'));
    return interaction.showModal(
      buildTextModal({
        customId: caseId('reason', modCase.id, state),
        title: t('moderation.cases.reasonModal.title', { number: caseNumber(modCase, t) }),
        label: t('moderation.reason'),
        inputId: REASON_INPUT_ID,
        placeholder: t('moderation.cases.reasonModal.placeholder'),
        value: modCase.reason ?? undefined,
        // Reasons from Discord's audit log can be longer than the bot's own, and Discord doesn't show a popup whose text doesn't fit
        maxLength: Math.max(MAX_REASON_LENGTH, modCase.reason?.length ?? 0),
        optional: true,
        paragraph: true,
      }),
    );
  }

  if (parsed.action === 'end') {
    const modCase = await caseForPopup(interaction, parsed.caseId);
    if (modCase === 'slow') return sendError(interaction, t('moderation.cases.slow'));
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
      if (!modCase) return;
      const problem = await changeProblem(interaction, modCase, t);
      if (problem) return sendError(interaction, problem);
      return interaction.editReply(renderDeleteQuestion(modCase, state, t));
    }
    case 'deleteYes': {
      const modCase = await caseOrGone(interaction, parsed.caseId, state, t);
      if (!modCase) return;
      const problem = await changeProblem(interaction, modCase, t);
      if (problem) return sendError(interaction, problem);
      // Deleting it makes it a ban for good, which only those who can ban may do, like changing its end
      if (isRunningTempBan(modCase) && !interaction.member.permissions.has('BanMembers')) {
        return sendError(interaction, t('moderation.cases.delete.noBanPermission'));
      }
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
  // Like its buttons and selects, as they may not be a moderator anymore since the popup was opened
  if (!interaction.member.permissions.has('ModerateMembers')) {
    return sendError(interaction, t('system.button.permissions', { permissions: t('permission.ModerateMembers') }));
  }

  if (parsed.action === 'goto') {
    const page = readPageInput(interaction);
    if (page === null) return sendError(interaction, t('pagination.modal.invalid'));
    await interaction.deferUpdate();
    // A page past the end shows the last one
    return interaction.editReply(await renderCaseList(interaction.guild, { userId: parsed.userId, sort: parsed.sort, page: page - 1 }, t));
  }
  if (parsed.action === 'end') {
    await interaction.deferUpdate();
    // Like the other actions on them, so it can't run alongside, say, /untimeout, and it sees the case as that left it
    return oneAtATime(interaction.guildId, parsed.state.userId, () => changeEnd(interaction, parsed.caseId, parsed.state, t));
  }
  if (parsed.action !== 'reason') return sendError(interaction, t('system.outdated'));

  await interaction.deferUpdate();
  const reason = interaction.fields.getTextInputValue(REASON_INPUT_ID).trim() || null;
  const before = await caseOrGone(interaction, parsed.caseId, parsed.state, t);
  if (!before) return;
  const problem = await changeProblem(interaction, before, t);
  if (problem) return sendError(interaction, problem);
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
    .setMaxLength(DURATION_INPUT_LENGTH)
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

/** End a running timeout or ban right away, as a case of its own. The case is made first, so the logs find it, and taken back if Discord says no. */
async function endNow(interaction: ModalSubmitInteraction<'cached'>, modCase: ModCase, state: CasesState, t: Translate): Promise<unknown> {
  const { guild } = interaction;
  const reason = interaction.fields.getTextInputValue(END_REASON_INPUT_ID).trim() || null;
  const type = modCase.type === 'ban' ? 'unban' : 'untimeout';

  // Asked of Discord first, as it may be over already, like when it was lifted while the bot was offline. Then its case only ends
  let act: (auditReason: string) => Promise<unknown>;
  let stillOn: boolean;
  if (type === 'unban') {
    if (!interaction.member.permissions.has('BanMembers')) return sendError(interaction, t('moderation.cases.endModal.noBanPermission'));
    const banned = await fetchBanned(guild, modCase.userId);
    if (banned === undefined) return sendError(interaction, t('moderation.problems.banUnknown'));
    stillOn = banned;
    act = (audit) => guild.members.unban(modCase.userId, audit);
  } else {
    const member = await fetchMember(guild, modCase.userId);
    if (member === undefined) return sendError(interaction, t('moderation.problems.memberUnknown'));
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(guild, interaction.member, member.user, member, 'untimeout', t);
    if (problem) return sendError(interaction, problem);
    stillOn = member.isCommunicationDisabled();
    act = (audit) => member.timeout(null, audit);
  }
  if (!stillOn) {
    await endCase(modCase.id);
    const ended = (await getCase(guild.id, modCase.id)) ?? { ...modCase, endedAt: new Date() };
    const notice = t('moderation.cases.endModal.alreadyOver', { number: caseNumber(modCase, t) });
    return interaction.editReply(withNotice(notice, 'info', await renderCaseView(guild, ended, state, t)));
  }

  const lifted = await createCase({ guildId: guild.id, type, userId: modCase.userId, moderatorId: interaction.user.id, reason });
  try {
    await act(auditReason(interaction.user, reason));
  } catch (error) {
    if (!(await happenedAnyway(error, guild, modCase.userId, type, null))) {
      await undoCase(lifted);
      return sendError(interaction, t('moderation.failed'));
    }
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
  const modCase = await caseOrGone(interaction, id, state, t);
  if (!modCase) return;
  if (!canChangeEnd(modCase) || (modCase.type !== 'timeout' && modCase.type !== 'ban'))
    return sendError(interaction, t('moderation.cases.endModal.notRunning'));
  const problem = await changeProblem(interaction, modCase, t);
  if (problem) return sendError(interaction, problem);
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
    const member = await fetchMember(interaction.guild, modCase.userId);
    if (member === undefined) return sendError(interaction, t('moderation.problems.memberUnknown'));
    if (!member) return sendError(interaction, t('moderation.problems.notMember'));
    const problem = moderationProblem(interaction.guild, interaction.member, member.user, member, 'timeout', t);
    if (problem) return sendError(interaction, problem);
    try {
      await member.disableCommunicationUntil(end, reason);
    } catch (error) {
      if (!(await happenedAnyway(error, interaction.guild, modCase.userId, 'timeout', end))) return sendError(interaction, t('moderation.failed'));
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
