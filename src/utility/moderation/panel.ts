import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  CheckboxBuilder,
  ContainerBuilder,
  type Guild,
  type GuildMember,
  LabelBuilder,
  ModalBuilder,
  type ModalSubmitInteraction,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  subtext,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import { CASE_TYPES, getUserCases } from 'database/moderation';

import type { ModCaseType } from 'generated/prisma/client';
import { fetchMember } from 'utility/discord';
import { DiscordLimits } from 'utility/discordLimits';
import { DAY, DURATION_INPUT_LENGTH, HOUR } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import type { IconName } from 'utility/icons';
import { getTranslate, type Translate } from 'utility/i18next';
import { userRef } from 'utility/logs/format';
import { caseCountLine, renderCasesFor } from 'utility/moderation/cases';
import {
  CASE_ICONS,
  fetchBanned,
  formatUntil,
  MAX_REASON_LENGTH,
  MAX_TIMEOUT_DAYS,
  moderate,
  moderationProblem,
  MODERATOR_PERMISSIONS,
  permissionProblem,
} from 'utility/moderation/run';
import { quietMessageOf, type ResponsePayload, sendError, withNotice } from 'utility/response';
import { ThemeColors } from 'utility/theme';
import { buildUserInfo } from 'utility/userInfo';

/**
 * The moderation panel, from the Moderation menu on someone's name: how they're doing, and a button for each thing to do to them.
 * Its buttons are `modpanel:<action>:<user>`, and the popups they open are named the same, so they work however old the panel is.
 */
export const MOD_PANEL_PREFIX = 'modpanel:';

const REASON_INPUT_ID = 'reason';
const DURATION_INPUT_ID = 'duration';
const DELETE_INPUT_ID = 'delete';
const DM_INPUT_ID = 'dm';

/** How far back a ban can delete messages, as the popup offers it, in seconds. */
const DELETE_MESSAGES = { none: 0, hour: HOUR / 1000, day: DAY / 1000, week: (7 * DAY) / 1000 } as const;

const isCaseType = (value: string): value is ModCaseType => (CASE_TYPES as readonly string[]).includes(value);

/** What a panel button does: one of the actions, show the cases or the user info in the panel's place, or go back to the panel from there. */
type PanelAction = ModCaseType | 'cases' | 'info' | 'panel';
const VIEWS: readonly string[] = ['cases', 'info', 'panel'] satisfies PanelAction[];

const panelId = (action: PanelAction, userId: string) => `${MOD_PANEL_PREFIX}${action}:${userId}`;

/**
 * The panel for someone: how they're doing, how many cases they have, and the buttons. A button is off when the moderator isn't allowed
 * to do it or it can't be done to them. Problems that apply to everything, like it being the moderator themselves, are said right away.
 */
export async function renderModerationPanel(guild: Guild, userId: string, moderator: GuildMember, t: Translate): Promise<ResponsePayload> {
  const [user, member, { counts, total }] = await Promise.all([
    guild.client.users.fetch(userId).catch(() => null),
    // Asked of Discord, as right after a kick or ban the cache may still have them
    fetchMember(guild, userId),
    getUserCases(guild.id, userId, 'newest', 0, 0),
  ]);
  const banned = member === null ? await fetchBanned(guild, userId) : false;
  // When Discord couldn't be asked, the buttons could be the wrong ones, like Ban for someone banned, so they're all off
  const unknown = member === undefined || banned === undefined;
  const timedOut = member?.isCommunicationDisabled() ? member.communicationDisabledUntil : null;

  const status: string[] = [];
  if (unknown) status.push(t('moderation.panel.unknown'));
  else if (timedOut) status.push(t('moderation.panel.timedOut', { until: formatUntil(timedOut) }));
  else if (banned) status.push(t('moderation.panel.banned'));
  else if (!member) status.push(t('moderation.panel.notMember'));
  status.push(caseCountLine(counts, total, t));
  // Warn has no rules of its own, so what's wrong with it is wrong with everything
  const problem = user && !unknown ? moderationProblem(guild, moderator, user, member ?? null, 'warn', t) : null;
  if (problem) status.push(problem);

  const action = (type: ModCaseType, style: ButtonStyle, needsMember: boolean) =>
    new ButtonBuilder()
      .setCustomId(panelId(type, userId))
      .setLabel(t(`moderation.panel.actions.${type}`))
      .setEmoji(buttonIcon(CASE_ICONS[type]))
      .setStyle(style)
      .setDisabled(!user || unknown || problem !== null || (needsMember && !member) || !moderator.permissions.has(MODERATOR_PERMISSIONS[type]));
  const cases = new ButtonBuilder()
    .setCustomId(panelId('cases', userId))
    .setLabel(t('moderation.panel.actions.cases'))
    .setEmoji(buttonIcon('scroll-text' satisfies IconName))
    .setStyle(ButtonStyle.Secondary)
    // Nothing to see without any, which the status line above already says
    .setDisabled(total === 0);
  const info = new ButtonBuilder()
    .setCustomId(panelId('info', userId))
    .setLabel(t('moderation.panel.actions.info'))
    .setEmoji(buttonIcon('circle-user' satisfies IconName))
    .setStyle(ButtonStyle.Secondary);

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([t('moderation.panel.title', { user: userRef(guild, userId) }), ...status.map((line) => subtext(line))].join('\n')),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        action('warn', ButtonStyle.Secondary, true),
        timedOut ? action('untimeout', ButtonStyle.Secondary, true) : action('timeout', ButtonStyle.Secondary, true),
        action('kick', ButtonStyle.Danger, true),
        banned ? action('unban', ButtonStyle.Secondary, false) : action('ban', ButtonStyle.Danger, false),
        cases,
      ),
    )
    // A row of its own, as the first one has as many buttons as Discord allows
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(info));
  return quietMessageOf(container);
}

/** The popup asking the details of what to do to someone: why, and depending on what, how long, which messages to delete, and the DM. */
export function buildActionModal(type: ModCaseType, userId: string, name: string, t: Translate): ModalBuilder {
  const labels: LabelBuilder[] = [];
  const reason = new LabelBuilder().setLabel(t('moderation.panel.modal.reason')).setTextInputComponent(
    new TextInputBuilder()
      .setCustomId(REASON_INPUT_ID)
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(MAX_REASON_LENGTH)
      // Like /warn, as a warning is nothing but its reason
      .setRequired(type === 'warn'),
  );
  const duration = (required: boolean, placeholder: string) =>
    new LabelBuilder()
      .setLabel(t('moderation.panel.modal.duration'))
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId(DURATION_INPUT_ID)
          .setStyle(TextInputStyle.Short)
          .setMaxLength(DURATION_INPUT_LENGTH)
          .setRequired(required)
          .setPlaceholder(placeholder),
      );

  if (type === 'timeout') labels.push(duration(true, t('moderation.panel.modal.durationTimeout', { max: MAX_TIMEOUT_DAYS })), reason);
  else if (type === 'ban') {
    labels.push(
      reason,
      duration(false, t('moderation.panel.modal.durationBan')),
      new LabelBuilder().setLabel(t('moderation.panel.modal.deleteMessages')).setRadioGroupComponent(
        new RadioGroupBuilder().setCustomId(DELETE_INPUT_ID).addOptions(
          (Object.keys(DELETE_MESSAGES) as (keyof typeof DELETE_MESSAGES)[]).map((key) =>
            new RadioGroupOptionBuilder()
              .setValue(key)
              .setLabel(t(`moderation.panel.modal.deleteOptions.${key}`))
              .setDefault(key === 'none'),
          ),
        ),
      ),
    );
  } else labels.push(reason);

  // Like /unban, someone unbanned rarely shares a server with the bot to get a DM
  if (type !== 'unban') {
    labels.push(
      new LabelBuilder()
        .setLabel(t('moderation.panel.modal.dm'))
        .setDescription(t('moderation.panel.modal.dmDescription'))
        .setCheckboxComponent(new CheckboxBuilder().setCustomId(DM_INPUT_ID).setDefault(true)),
    );
  }

  return new ModalBuilder()
    .setCustomId(panelId(type, userId))
    .setTitle(t(`moderation.panel.modal.title.${type}`, { user: name }).slice(0, DiscordLimits.modalTitleLength))
    .addLabelComponents(...labels);
}

/** Read a panel button or popup's custom ID, or null if it's from an older version of the panel. */
export function parsePanelId(customId: string): { action: PanelAction; userId: string } | null {
  const [action = '', userId = ''] = customId.slice(MOD_PANEL_PREFIX.length).split(':');
  if (!/^\d+$/.test(userId) || (!VIEWS.includes(action) && !isCaseType(action))) return null;
  return { action: action as PanelAction, userId };
}

/** The panel's buttons: the case history or user info in its place, back to the panel from there, or the popup for what to do. */
export async function handleModerationPanelButton(interaction: ButtonInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parsePanelId(interaction.customId);
  if (!parsed) return sendError(interaction, t('system.outdated'));

  if (parsed.action === 'cases' || parsed.action === 'info' || parsed.action === 'panel') {
    // Answered first, as asking Discord and the database can take a moment
    await interaction.deferUpdate();
    if (parsed.action === 'cases') return interaction.editReply(await renderCasesFor(interaction.guild, parsed.userId, t, true));
    if (parsed.action === 'panel') return interaction.editReply(await renderModerationPanel(interaction.guild, parsed.userId, interaction.member, t));
    const back = new ButtonBuilder()
      .setCustomId(panelId('panel', parsed.userId))
      .setLabel(t('moderation.panel.actions.back'))
      .setEmoji(buttonIcon('chevron-left' satisfies IconName))
      .setStyle(ButtonStyle.Secondary);
    return interaction.editReply(await buildUserInfo(interaction.client, parsed.userId, { guild: interaction.guild, viewer: interaction.member }, t, back));
  }
  // Checked when pressed, as who sees a panel can change meanwhile
  const problem = permissionProblem(interaction.member, MODERATOR_PERMISSIONS[parsed.action], t);
  if (problem) return sendError(interaction, problem);
  // Their name from what's known already, as a popup has to be shown within 3 seconds
  const name = interaction.guild.members.cache.get(parsed.userId)?.displayName ?? interaction.client.users.cache.get(parsed.userId)?.username ?? parsed.userId;
  return interaction.showModal(buildActionModal(parsed.action, parsed.userId, name, t));
}

/** A popup of the panel: do what it asks for, then show the panel again, with how it went above it. */
export async function handleModerationPanelModal(interaction: ModalSubmitInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parsePanelId(interaction.customId);
  if (!parsed || !isCaseType(parsed.action)) return sendError(interaction, t('system.outdated'));
  const type = parsed.action;
  const problem = permissionProblem(interaction.member, MODERATOR_PERMISSIONS[type], t);
  if (problem) return sendError(interaction, problem);

  // Answered before anything is asked of Discord, as it gives up after 3 seconds
  await interaction.deferUpdate();
  const { guild } = interaction;
  const user = await interaction.client.users.fetch(parsed.userId).catch(() => null);
  if (!user) return sendError(interaction, t('system.outdated'));

  const { fields } = interaction;
  const text = (id: string) => (fields.fields.has(id) ? fields.getTextInputValue(id).trim() || null : null);
  const deleteKey = fields.fields.has(DELETE_INPUT_ID) ? fields.getRadioGroup(DELETE_INPUT_ID) : null;
  const result = await moderate(interaction, {
    type,
    user,
    reason: text(REASON_INPUT_ID),
    duration: text(DURATION_INPUT_ID),
    deleteMessageSeconds: deleteKey && deleteKey in DELETE_MESSAGES ? DELETE_MESSAGES[deleteKey as keyof typeof DELETE_MESSAGES] : 0,
    dm: fields.fields.has(DM_INPUT_ID) ? fields.getCheckbox(DM_INPUT_ID) : false,
  });

  const panel = await renderModerationPanel(guild, user.id, interaction.member, t);
  return interaction.editReply(withNotice(result.content, result.ok ? 'success' : 'error', panel));
}
