import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  roleMention,
  SeparatorBuilder,
  SeparatorSpacingSize,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import type { Giveaway } from 'database/giveaways';

import { buttonIcon } from 'utility/emojis';
import { openParticipantsId } from 'utility/giveaways/participants';
import { bonusRolesOf, type GiveawayRules } from 'utility/giveaways/rules';
import { formatDuration, formatNumber, MINUTE } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { quietMessageOf, type ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** Custom IDs of the buttons on a giveaway's post, with the giveaway's ID after them. */
export const GIVEAWAY_CUSTOM_ID = {
  join: 'gw:join:',
  // On the reply to Join, for someone who's in already
  leave: 'gw:leave:',
  // Under the winners' announcement, when they have to claim their prize
  claim: 'gw:claim:',
} as const;

/** What the post shows besides the giveaway itself. */
export interface PostState {
  /** How many people entered. */
  participants: number;
  /** Who won, once it ended, without the ones who were replaced. Null for winners who deleted their data, who still count. */
  winnerIds: (string | null)[];
}

/** Roles in a line, like `@A, @B`. */
export const formatRoles = (roleIds: string[]) => roleIds.map(roleMention).join(', ');

/** Every rule of a giveaway as a line, like `Level 10 or higher`, for the post and the draft. */
export function describeRules(rules: GiveawayRules, t: Translate): string[] {
  const lines: string[] = [];
  if (rules.requiredRoleIds.length > 0) {
    const key = rules.requireAllRoles && rules.requiredRoleIds.length > 1 ? 'giveaway.rules.requiredAll' : 'giveaway.rules.requiredAny';
    lines.push(t(key, { roles: formatRoles(rules.requiredRoleIds), count: rules.requiredRoleIds.length }));
  }
  if (rules.blockedRoleIds.length > 0) lines.push(t('giveaway.rules.blocked', { roles: formatRoles(rules.blockedRoleIds) }));
  if (rules.minLevel) lines.push(t('giveaway.rules.level', { level: formatNumber(rules.minLevel, t) }));
  if (rules.minMemberMinutes) lines.push(t('giveaway.rules.memberAge', { duration: formatDuration(rules.minMemberMinutes * MINUTE, t) }));
  if (rules.minAccountMinutes) lines.push(t('giveaway.rules.accountAge', { duration: formatDuration(rules.minAccountMinutes * MINUTE, t) }));
  return lines;
}

/**
 * A giveaway's post: while it runs, with its end, rules and a button to join, and once it ended or was cancelled, with its winners.
 * Mentions in it never ping, so editing it doesn't notify anyone. Pings are sent on their own, like when it starts or ends.
 * @param rules Its rules, without roles that were deleted.
 */
export function buildGiveawayPost(giveaway: Giveaway, rules: GiveawayRules, state: PostState, t: Translate): ResponsePayload {
  const running = giveaway.status === 'active' || giveaway.status === 'draft';
  const title = running ? 'giveaway.post.title' : giveaway.status === 'ended' ? 'giveaway.post.titleEnded' : 'giveaway.post.titleCancelled';
  const container = new ContainerBuilder()
    .setAccentColor(running ? ThemeColors.info : giveaway.status === 'ended' ? ThemeColors.success : ThemeColors.warning)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([t(title), `## ${giveaway.prize}`, giveaway.description].filter(Boolean).join('\n')));

  // A draft is shown as if it started now, as it would when started
  const endsAt = giveaway.endsAt ?? new Date(Date.now() + giveaway.durationMinutes * MINUTE);
  const details = [
    running
      ? t('giveaway.post.ends', { relative: time(endsAt, TimestampStyles.RelativeTime), date: time(endsAt, TimestampStyles.LongDateShortTime) })
      : t('giveaway.post.ended', { relative: time(giveaway.endedAt ?? endsAt, TimestampStyles.RelativeTime) }),
    t('giveaway.post.details', {
      winners: t('giveaway.post.winnerCount', { count: giveaway.winnerCount }),
      host: giveaway.host ?? userMention(giveaway.hostId),
    }),
  ];
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small));

  if (running) {
    const ruleLines = describeRules(rules, t);
    if (ruleLines.length > 0) details.push('', t('giveaway.post.rules'), ...ruleLines.map((line) => `- ${line}`));
    const bonusRoles = bonusRolesOf(giveaway);
    if (bonusRoles.length > 0) {
      details.push(
        '',
        t('giveaway.post.bonus'),
        ...bonusRoles.map((role) => `- ${t('giveaway.post.bonusRole', { role: roleMention(role.roleId), bonus: formatNumber(role.bonus, t) })}`),
      );
    }
  } else if (giveaway.status === 'ended') {
    details.push(
      '',
      state.winnerIds.length > 0
        ? t('giveaway.post.winners', {
            winners: state.winnerIds.map((id) => (id ? userMention(id) : t('giveaway.participants.deletedUser'))).join(', '),
            count: state.winnerIds.length,
          })
        : t('giveaway.post.noWinners'),
    );
  } else {
    details.push('', t('giveaway.post.cancelled'));
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(details.join('\n')));

  const footer = [t('giveaway.post.participants', { count: state.participants })];
  if (giveaway.number) footer.push(subtext(t('giveaway.post.number', { number: formatNumber(giveaway.number, t) })));
  container
    // Large, like above the buttons of the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer.join('\n')));

  const buttons: ButtonBuilder[] = [];
  if (running) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${GIVEAWAY_CUSTOM_ID.join}${giveaway.id}`)
        .setLabel(t('giveaway.post.join'))
        .setEmoji(buttonIcon('gift'))
        .setStyle(ButtonStyle.Primary)
        // A draft's preview can't be used
        .setDisabled(giveaway.status === 'draft'),
    );
  }
  // Also once it ended, to see who was in it
  buttons.push(
    new ButtonBuilder()
      .setCustomId(openParticipantsId(giveaway.id))
      .setLabel(t('giveaway.post.participantsButton'))
      .setEmoji(buttonIcon('users'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(giveaway.status === 'draft'),
  );
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));

  return quietMessageOf(container);
}
