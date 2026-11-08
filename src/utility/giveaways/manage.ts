import {
  ActionRowBuilder,
  type AnySelectMenuInteraction,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  channelMention,
  ContainerBuilder,
  type Guild,
  hyperlink,
  MessageFlags,
  messageLink,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  strikethrough,
  subtext,
  TextDisplayBuilder,
  time,
  TimestampStyles,
  userMention,
  UserSelectMenuBuilder,
} from 'discord.js';

import { getFeatureSwitches, setFeatureSwitch } from 'database/features';
import {
  cancelGiveaway,
  countGiveaways,
  countParticipants,
  deleteGiveaway,
  getAllWinners,
  getGiveaway,
  leaveGiveaway,
  type Giveaway,
  type GiveawayTab,
  listGiveaways,
  MAX_ACTIVE_GIVEAWAYS,
} from 'database/giveaways';

import { getGiveawaySettings } from 'settings/giveaway';

import { buildQuestion } from 'utility/confirm';
import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber } from 'utility/duration';
import { buttonIcon } from 'utility/emojis';
import { endGiveaway, rerollWinners } from 'utility/giveaways/end';
import { logGiveaway } from 'utility/giveaways/logs';
import { MANAGE_ACTIONS, MANAGE_PREFIX, type ManageAction, manageId } from 'utility/giveaways/ids';
import { openParticipantsId } from 'utility/giveaways/participants';
import { markPostChanged, syncPost } from 'utility/giveaways/sync';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { type ResponsePayload, sendError, withNotice } from 'utility/response';
import { buildSwitchSection, settingsContext } from 'utility/settings';
import { shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

export { MANAGE_PREFIX };
const TABS: GiveawayTab[] = ['active', 'ended'];

/** A giveaway's number, like `#4`. */
const numberOf = (giveaway: Giveaway, t: Translate) => (giveaway.number ? t('giveaway.manage.number', { number: formatNumber(giveaway.number, t) }) : '');

/** A server's running or ended giveaways, with buttons to switch between them, and a select to open one. */
export async function renderGiveawayList(guild: Guild, tab: GiveawayTab, t: Translate): Promise<ResponsePayload> {
  const [giveaways, counts, { giveawaysEnabled }] = await Promise.all([listGiveaways(guild.id, tab), countGiveaways(guild.id), getFeatureSwitches(guild.id)]);
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('giveaway.manage.listTitle')))
    // Large, so the title, the switch and the list stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addSectionComponents(
      buildSwitchSection(t('giveaway.manage.enabled.label'), t('giveaway.manage.enabled.description'), giveawaysEnabled, `${MANAGE_PREFIX}toggle:${tab}`, t),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        TABS.map((option) =>
          new ButtonBuilder()
            .setCustomId(`${MANAGE_PREFIX}list:${option}`)
            .setLabel(t(`giveaway.manage.tabs.${option}`, { count: formatNumber(counts[option], t) }))
            .setStyle(option === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(option === tab),
        ),
      ),
    );

  if (giveaways.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t(`giveaway.manage.none.${tab}`)));
    return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
  }

  const count =
    tab === 'active'
      ? t('giveaway.manage.countActive', { count: giveaways.length, max: formatNumber(MAX_ACTIVE_GIVEAWAYS, t) })
      : t('giveaway.manage.countEnded', { count: counts.ended, shown: formatNumber(giveaways.length, t) });
  const lines = giveaways.map((giveaway, index) => {
    const when = tab === 'active' ? giveaway.endsAt : giveaway.endedAt;
    return t(`giveaway.manage.item.${giveaway.status === 'cancelled' ? 'cancelled' : tab}`, {
      position: index + 1,
      prize: shorten(giveaway.prize, 60),
      number: numberOf(giveaway, t),
      channel: channelMention(giveaway.channelId),
      time: when ? time(when, TimestampStyles.RelativeTime) : '?',
      people: t('giveaway.participants.people', { count: giveaway._count.entries }),
    });
  });
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([subtext(count), ...lines].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${MANAGE_PREFIX}open`)
          .setPlaceholder(t('giveaway.manage.placeholder'))
          .addOptions(
            giveaways.map((giveaway) =>
              new StringSelectMenuOptionBuilder()
                .setValue(giveaway.id)
                .setLabel(shorten(`${numberOf(giveaway, t)} ${giveaway.prize}`.trim(), DiscordLimits.optionLabelLength))
                .setDescription(
                  shorten(
                    `#${guild.channels.cache.get(giveaway.channelId)?.name ?? '?'} · ${t('giveaway.participants.people', { count: giveaway._count.entries })}`,
                    DiscordLimits.optionLabelLength,
                  ),
                ),
            ),
          ),
      ),
    );
  // Giveaways are listed with their channel, which mustn't ping anyone
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** How a winner is shown: struck through when they were replaced, and whether they claimed their prize when they had to. */
function winnerLine(winner: Awaited<ReturnType<typeof getAllWinners>>[number], t: Translate): string {
  const name = winner.userId ? userMention(winner.userId) : t('giveaway.participants.deletedUser');
  if (winner.replacedAt) return `- ${strikethrough(name)} ${subtext(t('giveaway.manage.winner.replaced'))}`;
  if (winner.claimedAt) return `- ${name} ${subtext(t('giveaway.manage.winner.claimed'))}`;
  if (winner.claimBy) return `- ${name} ${subtext(t('giveaway.manage.winner.claimBy', { time: time(winner.claimBy, TimestampStyles.RelativeTime) }))}`;
  return `- ${name}`;
}

/** One giveaway with everything about it, and buttons for what can be done with it. */
export async function renderGiveawayPanel(guild: Guild, giveaway: Giveaway, t: Translate): Promise<ResponsePayload> {
  const [participants, winners] = await Promise.all([countParticipants(giveaway.id), getAllWinners(giveaway.id)]);
  // Also one whose time is up but that wasn't ended yet, which End now ends right away
  const running = giveaway.status === 'active';
  const status =
    giveaway.status === 'cancelled'
      ? t('giveaway.manage.status.cancelled', { time: time(giveaway.endedAt ?? new Date(), TimestampStyles.RelativeTime) })
      : giveaway.status === 'ended'
        ? t('giveaway.manage.status.ended', { time: time(giveaway.endedAt ?? new Date(), TimestampStyles.RelativeTime) })
        : t('giveaway.manage.status.running', { time: time(giveaway.endsAt ?? new Date(), TimestampStyles.RelativeTime) });
  const where = giveaway.messageId
    ? hyperlink(t('giveaway.manage.jump'), messageLink(giveaway.channelId, giveaway.messageId, guild.id))
    : t('giveaway.manage.noPost');

  const lines = [
    t('giveaway.manage.title', { number: numberOf(giveaway, t) }),
    `## ${giveaway.prize}`,
    status,
    t('giveaway.manage.where', { channel: channelMention(giveaway.channelId), post: where }),
    t('giveaway.manage.by', { user: userMention(giveaway.hostId), host: giveaway.host ?? userMention(giveaway.hostId) }),
    t('giveaway.manage.people', { people: t('giveaway.participants.people', { count: participants }) }),
  ];
  if (giveaway.status === 'ended') {
    lines.push('', t('giveaway.manage.winners', { count: giveaway.winnerCount }));
    lines.push(...(winners.length > 0 ? winners.map((winner) => winnerLine(winner, t)) : [t('giveaway.manage.noWinners')]));
  }

  const buttons = running
    ? [
        new ButtonBuilder()
          .setCustomId(manageId('end', giveaway.id))
          .setLabel(t('giveaway.manage.end'))
          .setEmoji(buttonIcon('trophy'))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(manageId('edit', giveaway.id))
          .setLabel(t('giveaway.manage.edit'))
          .setEmoji(buttonIcon('pencil'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(manageId('cancel', giveaway.id))
          .setLabel(t('giveaway.manage.cancel'))
          .setEmoji(buttonIcon('x'))
          .setStyle(ButtonStyle.Danger),
      ]
    : [
        // Only an ended one has winners to replace, not a cancelled one
        ...(giveaway.status === 'ended'
          ? [
              new ButtonBuilder()
                .setCustomId(manageId('reroll', giveaway.id))
                .setLabel(t('giveaway.manage.reroll'))
                .setEmoji(buttonIcon('refresh-cw'))
                .setStyle(ButtonStyle.Primary)
                .setDisabled(!winners.some((winner) => !winner.replacedAt)),
            ]
          : []),
        new ButtonBuilder()
          .setCustomId(manageId('delete', giveaway.id))
          .setLabel(t('giveaway.manage.delete'))
          .setEmoji(buttonIcon('trash-2'))
          .setStyle(ButtonStyle.Danger),
      ];
  buttons.push(
    // Opens the list everyone can see, in a reply of its own, so this panel stays
    new ButtonBuilder()
      .setCustomId(openParticipantsId(giveaway.id))
      .setLabel(t('giveaway.post.participantsButton'))
      .setEmoji(buttonIcon('users'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${MANAGE_PREFIX}list:${running ? 'active' : 'ended'}`)
      .setLabel(t('giveaway.manage.back'))
      .setStyle(ButtonStyle.Secondary),
  );

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  if (running && participants > 0) {
    // Like for alts, or someone who broke the rules. They can join again, unless a rule keeps them out
    container.addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
        new UserSelectMenuBuilder().setCustomId(manageId('remove', giveaway.id)).setPlaceholder(t('giveaway.manage.removePlaceholder')),
      ),
    );
  }
  container.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** Delete a giveaway's post, if it still has one. */
async function deletePost(guild: Guild, giveaway: Giveaway) {
  const channel = guild.channels.cache.get(giveaway.channelId);
  if (!giveaway.messageId || !channel?.isTextBased()) return;
  await channel.messages.delete(giveaway.messageId).catch((error: unknown) => logger.debug(error, `Couldn't delete the post of giveaway ${giveaway.id}`));
}

const isTab = (value: string | undefined): value is GiveawayTab => TABS.includes(value as GiveawayTab);

/** The buttons of the giveaway list and of a giveaway's panel. Everything they need is in their custom ID, so they never stop working. */
export async function handleManageButton(interaction: ButtonInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const [action, argument] = interaction.customId.slice(MANAGE_PREFIX.length).split(':');

  // Answered before anything is looked up, as Discord gives up after 3 seconds. Ending can take a while with many participants
  await interaction.deferUpdate();
  if (action === 'list' || action === 'toggle') {
    if (!isTab(argument)) return sendError(interaction, t('system.outdated'));
    if (action === 'toggle') {
      // Running giveaways wait with their draw while it's off, and are drawn once it's on again
      const { giveawaysEnabled } = await getFeatureSwitches(interaction.guildId);
      await setFeatureSwitch(interaction.guildId, 'giveawaysEnabled', !giveawaysEnabled);
    }
    return interaction.editReply(await renderGiveawayList(interaction.guild, argument, t));
  }
  if (!MANAGE_ACTIONS.includes(action as ManageAction) || !argument) return sendError(interaction, t('system.outdated'));

  const giveaway = await getGiveaway(interaction.guildId, argument);
  if (!giveaway || giveaway.status === 'draft') {
    return interaction.editReply(withNotice(t('giveaway.manage.gone'), 'info', await renderGiveawayList(interaction.guild, 'active', t)));
  }
  const panelWith = async (notice: string, kind: 'success' | 'info') =>
    interaction.editReply(
      withNotice(notice, kind, await renderGiveawayPanel(interaction.guild, (await getGiveaway(interaction.guildId, giveaway.id)) ?? giveaway, t)),
    );

  switch (action as ManageAction) {
    case 'view':
      return interaction.editReply(await renderGiveawayPanel(interaction.guild, giveaway, t));

    case 'reroll':
      if (giveaway.status !== 'ended') return panelWith(t('giveaway.manage.notEnded'), 'info');
      return interaction.editReply(await renderRerollPicker(interaction.guild, giveaway, t));

    case 'edit':
      if (giveaway.status !== 'active') return panelWith(t('giveaway.manage.notRunning'), 'info');
      return interaction.editReply(await getGiveawaySettings(giveaway.id).render(settingsContext(interaction), t));

    case 'end':
      if (giveaway.status !== 'active') return panelWith(t('giveaway.manage.notRunning'), 'info');
      await endGiveaway(interaction.guild, giveaway, interaction.user.id);
      return panelWith(t('giveaway.manage.ended'), 'success');

    case 'cancel':
      return interaction.editReply(
        buildQuestion(
          {
            question: t('giveaway.manage.cancelQuestion', { prize: giveaway.prize }),
            confirm: t('giveaway.manage.cancelConfirm'),
            cancel: t('giveaway.manage.keep'),
          },
          { confirm: manageId('cancelYes', giveaway.id), cancel: manageId('view', giveaway.id) },
        ),
      );

    case 'cancelYes':
      if (!(await cancelGiveaway(giveaway.id))) return panelWith(t('giveaway.manage.notRunning'), 'info');
      await syncPost(interaction.guild, giveaway.id);
      await logGiveaway(interaction.guild, 'giveawayCancelled', giveaway, interaction.user.id);
      return panelWith(t('giveaway.manage.cancelled'), 'success');

    case 'delete':
      return interaction.editReply(
        buildQuestion(
          {
            question: t('giveaway.manage.deleteQuestion', { prize: giveaway.prize }),
            confirm: t('giveaway.manage.deleteConfirm'),
            cancel: t('giveaway.manage.keep'),
          },
          { confirm: manageId('deleteYes', giveaway.id), cancel: manageId('view', giveaway.id) },
        ),
      );

    case 'deleteYes':
      // A running one has to be ended or cancelled first, so nobody's entry disappears without a word
      if (giveaway.status === 'active') return panelWith(t('giveaway.manage.stillRunning'), 'info');
      await deletePost(interaction.guild, giveaway);
      await deleteGiveaway(interaction.guildId, giveaway.id);
      await logGiveaway(interaction.guild, 'giveawayDeleted', giveaway, interaction.user.id);
      return interaction.editReply(withNotice(t('giveaway.manage.deleted'), 'success', await renderGiveawayList(interaction.guild, 'ended', t)));
  }
}

/** The select of the giveaway list, which opens a giveaway's panel. */
export async function handleManageSelect(interaction: AnySelectMenuInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferUpdate();
  const [action, argument] = interaction.customId.slice(MANAGE_PREFIX.length).split(':');
  // The list's select picks a giveaway, the others are about the one in their custom ID
  const giveawayId = action === 'open' ? interaction.values[0] : argument;
  const giveaway = giveawayId ? await getGiveaway(interaction.guildId, giveawayId) : null;
  if (!giveaway || giveaway.status === 'draft') {
    return interaction.editReply(withNotice(t('giveaway.manage.gone'), 'info', await renderGiveawayList(interaction.guild, 'active', t)));
  }

  if (action === 'remove') {
    const userId = interaction.values[0];
    const removed = !!userId && giveaway.status === 'active' && (await leaveGiveaway(giveaway.id, userId));
    if (removed) markPostChanged(interaction.guildId, giveaway.id);
    const notice = removed ? t('giveaway.manage.removed', { user: userMention(userId) }) : t('giveaway.manage.notEntered');
    return interaction.editReply(withNotice(notice, removed ? 'success' : 'info', await renderGiveawayPanel(interaction.guild, giveaway, t)));
  }

  if (action === 'rerollPick') {
    if (giveaway.status !== 'ended') return interaction.editReply(await renderGiveawayPanel(interaction.guild, giveaway, t));
    const drawn = await rerollWinners(interaction.guild, giveaway, interaction.values, interaction.user.id);
    const notice = drawn.length > 0 ? t('giveaway.manage.rerolled', { count: drawn.length }) : t('giveaway.manage.nobodyLeft');
    return interaction.editReply(withNotice(notice, drawn.length > 0 ? 'success' : 'info', await renderGiveawayPanel(interaction.guild, giveaway, t)));
  }
  return interaction.editReply(await renderGiveawayPanel(interaction.guild, giveaway, t));
}

/** Pick which winners of a giveaway to replace with new ones. */
async function renderRerollPicker(guild: Guild, giveaway: Giveaway, t: Translate): Promise<ResponsePayload> {
  const winners = (await getAllWinners(giveaway.id)).filter((winner) => !winner.replacedAt);
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('giveaway.manage.rerollQuestion', { prize: giveaway.prize })));
  if (winners.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${MANAGE_PREFIX}rerollPick:${giveaway.id}`)
          .setPlaceholder(t('giveaway.manage.rerollPlaceholder'))
          .setMinValues(1)
          .setMaxValues(winners.length)
          .addOptions(
            winners.map((winner) =>
              new StringSelectMenuOptionBuilder()
                .setValue(winner.id)
                .setLabel(
                  shorten(
                    (winner.userId && guild.members.cache.get(winner.userId)?.displayName) ?? winner.userId ?? t('giveaway.participants.deletedUser'),
                    DiscordLimits.optionLabelLength,
                  ),
                ),
            ),
          ),
      ),
    );
  }
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(manageId('view', giveaway.id)).setLabel(t('giveaway.manage.back')).setStyle(ButtonStyle.Secondary),
    ),
  );
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}
