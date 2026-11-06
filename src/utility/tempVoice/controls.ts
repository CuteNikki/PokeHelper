import {
  ActionRowBuilder,
  type AnySelectMenuInteraction,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  channelMention,
  type ChatInputCommandInteraction,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
  userMention,
} from 'discord.js';

import { getTempVoiceCreators } from 'database/tempVoice';

import { formatNumber, SECOND } from 'utility/duration';
import { getTranslate, guildTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse, sendError } from 'utility/response';
import {
  canChange,
  canModerate,
  changeTempChannel,
  channelLabel,
  channelName,
  deleteTempChannel,
  findTempChannel,
  handOver,
  isStaff,
  maxLabelLength,
  type Change,
  type TempChannel,
} from 'utility/tempVoice/channel';
import {
  announce,
  buildPanel,
  MAX_PICKED,
  MODERATOR_ACTIONS,
  parseTempVoiceCustomId,
  TEMP_VOICE_EDIT_MODAL_PREFIX,
  tempVoiceCustomId,
  type TempVoiceAction,
} from 'utility/tempVoice/panel';

type Control = ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>;

const NAME_INPUT_ID = 'name';
const LIMIT_INPUT_ID = 'limit';
/** Discord allows up to 99 people in a voice channel with a limit. */
const MAX_LIMIT = 99;
/** A moment for everyone in a channel to read that it's being deleted. */
const DELETE_DELAY = 3 * SECOND;
/** The most people a channel keeps out, as each is a permission on every channel the owner makes, and their next one would take long to make. */
const MAX_KEPT_OUT = 50;

/**
 * The channel a control is for, if whoever used it may change it. Otherwise answers why not.
 * @param channelId From the control's custom ID.
 */
async function controlledChannel(interaction: Control, channelId: string, forModerators: boolean, t: Translate): Promise<TempChannel | null> {
  const temp = await findTempChannel(interaction.guild, channelId);
  if (!temp) {
    await sendError(interaction, t('tempVoice.controls.gone'));
    return null;
  }
  if (!(forModerators ? canModerate(interaction.member, temp) : canChange(interaction.member, temp))) {
    const owner = userMention(temp.record.ownerId);
    // A moderator can use some of the controls, so they're told this one is the owner's
    const text = canModerate(interaction.member, temp) ? t('tempVoice.controls.ownerOnly', { owner }) : t('tempVoice.controls.notOwner', { owner });
    await sendError(interaction, text);
    return null;
  }
  return temp;
}

/** "Try again in …", for a channel Discord won't change yet. */
const tryAgain = (retryAt: Date, t: Translate) => t('tempVoice.controls.changeLimit', { time: time(retryAt, TimestampStyles.RelativeTime) });

/**
 * After a change made from a panel, deferred with deferUpdate: shows that panel as it is now, and says so if Discord wouldn't change
 * the channel yet. The panel in the channel's chat catches up on its own.
 */
async function showChanged(interaction: Control, temp: TempChannel, result: { retryAt: Date } | void, t: Translate) {
  if (result) await sendError(interaction, tryAgain(result.retryAt, t));
  // The panel is in the server's language in the channel's chat, and in the user's own where only they see it
  const panelT = interaction.message?.flags.has(MessageFlags.Ephemeral) ? t : guildTranslate(interaction.guild);
  await interaction.editReply(buildPanel(temp, panelT));
}

/** What a popup changes: the name, the limit, or both, for panels from before they were apart. */
type EditKind = 'name' | 'limit' | 'both';

/** The popup to rename a channel, set its limit, or both. */
function buildEditModal(temp: TempChannel, kind: EditKind, t: Translate) {
  const labels: LabelBuilder[] = [];
  if (kind !== 'limit') {
    // Cut to what can be typed, as a name changed by hand can be longer, and Discord won't open the popup with it
    const maxLength = maxLabelLength(temp.record.namePrefix);
    labels.push(
      new LabelBuilder()
        .setLabel(t('tempVoice.edit.name'))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(NAME_INPUT_ID)
            .setValue(channelLabel(temp.record.namePrefix, temp.channel.name).slice(0, maxLength))
            .setMaxLength(maxLength)
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
    );
  }
  if (kind !== 'name') {
    const limit = new TextInputBuilder().setCustomId(LIMIT_INPUT_ID).setMaxLength(2).setStyle(TextInputStyle.Short).setRequired(false);
    // Empty while there's no limit, rather than a 0 to clear first
    if (temp.channel.userLimit) limit.setValue(String(temp.channel.userLimit));
    labels.push(new LabelBuilder().setLabel(t('tempVoice.edit.limit')).setTextInputComponent(limit));
  }
  return new ModalBuilder()
    .setCustomId(`${TEMP_VOICE_EDIT_MODAL_PREFIX}${temp.channel.id}:${kind}`)
    .setTitle(t(kind === 'name' ? 'tempVoice.edit.nameTitle' : kind === 'limit' ? 'tempVoice.edit.limitTitle' : 'tempVoice.edit.title'))
    .addLabelComponents(...labels);
}

/** The buttons of a panel, and of the question what to do about someone in the channel. */
export async function handleTempVoiceButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseTempVoiceCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
  // Answered before the channel is looked up, which can take a moment, as Discord gives up after 3 seconds. Not the ones opening a popup,
  // which has to be the first answer. Errors still only go to whoever pressed
  const opensPopup = parsed.action === 'rename' || parsed.action === 'limit' || parsed.action === 'edit';
  if (!opensPopup) await interaction.deferUpdate();
  const temp = await controlledChannel(interaction, parsed.channelId, MODERATOR_ACTIONS.includes(parsed.action), t);
  if (!temp) return;

  switch (parsed.action) {
    case 'lock':
    case 'hide': {
      const change = parsed.action === 'lock' ? { locked: !temp.record.locked } : { hidden: !temp.record.hidden };
      return showChanged(interaction, temp, await changeTempChannel(temp, interaction.member, change), t);
    }
    case 'rename':
      return interaction.showModal(buildEditModal(temp, 'name', t));
    case 'limit':
      return interaction.showModal(buildEditModal(temp, 'limit', t));
    // The one button for both, on panels posted before they were apart
    case 'edit':
      return interaction.showModal(buildEditModal(temp, 'both', t));
    case 'delete': {
      await announce(temp, guildTranslate(interaction.guild)('tempVoice.announce.deleted', { user: userMention(interaction.user.id) }));
      setTimeout(() => void deleteTempChannel(temp).catch((error: unknown) => logger.error(error, 'Failed to delete a temporary voice channel')), DELETE_DELAY);
      return;
    }
    case 'handover':
    case 'kick':
    case 'keepout':
      return handleMemberAction(interaction, temp, parsed.action, parsed.memberId ?? '', t);
    default:
      return sendError(interaction, t('system.outdated'));
  }
}

/**
 * Hand over, kick or keep out someone, after picking them from the panel. Answered on the question, which only whoever picked sees.
 * The button was deferred with deferUpdate.
 */
async function handleMemberAction(interaction: ButtonInteraction<'cached'>, temp: TempChannel, action: TempVoiceAction, memberId: string, t: Translate) {
  const answer = (text: string, kind: 'info' | 'error' = 'info') => interaction.editReply({ ...createResponse(text, kind), allowedMentions: { parse: [] } });
  const mention = userMention(memberId);
  const serverT = guildTranslate(interaction.guild);

  // Moderators help the owner, so they can't do anything to the owner or each other
  if (!canChange(interaction.member, temp) && (memberId === temp.record.ownerId || temp.record.moderators.includes(memberId))) {
    return answer(t('tempVoice.member.notOnModerators'), 'error');
  }

  if (action === 'kick') {
    const member = temp.channel.members.get(memberId);
    if (!member) return answer(t('tempVoice.member.alreadyLeft'));
    await member.voice.disconnect(`Kicked from a temporary voice channel by ${interaction.user.tag}`);
    await answer(t('tempVoice.member.kicked', { user: mention }));
    return announce(temp, serverT('tempVoice.announce.kicked', { user: userMention(interaction.user.id), target: mention }));
  }

  if (action === 'keepout') {
    if (memberId === temp.record.ownerId) return answer(t('tempVoice.member.ownerCantBeBlocked'), 'error');
    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
    if (member && isStaff(member)) return answer(t('tempVoice.member.staffCantBeBlocked'), 'error');
    // The channel's moderators are always let in, so keeping one out wouldn't do anything
    if (temp.record.moderators.includes(memberId)) return answer(t('tempVoice.member.moderatorCantBeBlocked', { user: mention }), 'error');
    if (!temp.record.blocked.includes(memberId) && temp.record.blocked.length >= MAX_KEPT_OUT) {
      return answer(t('tempVoice.member.keptOutFull', { max: formatNumber(MAX_KEPT_OUT, t) }), 'error');
    }
    await changeTempChannel(temp, interaction.member, (record) => ({ blocked: [...new Set([...record.blocked, memberId])] }));
    // Not kept out when the channel changed meanwhile, like being handed over, or whoever pressed can't change it anymore
    if (!temp.record.blocked.includes(memberId)) return answer(t('tempVoice.member.changedMeanwhile'), 'error');
    return answer(t('tempVoice.member.blocked', { user: mention }));
  }

  // Someone who isn't there would own a channel they can't look after
  const member = temp.channel.members.get(memberId);
  if (!member) return answer(t('tempVoice.member.cantTakeOver'), 'error');
  if (member.id === temp.record.ownerId) return answer(t('tempVoice.member.alreadyOwner', { user: mention }));
  const from = await handOver(temp, interaction.member, member.id);
  if (!from) return answer(t('tempVoice.member.changedMeanwhile'), 'error');
  await answer(t('tempVoice.member.handedOver', { user: mention }));

  // Says who did it, as staff can hand over anyone's channel, also to themselves
  const by = interaction.user.id;
  const text =
    by === from
      ? serverT('tempVoice.announce.handedOver', { old: userMention(from), new: mention })
      : by === member.id
        ? serverT('tempVoice.announce.tookOver', { old: userMention(from), new: mention })
        : serverT('tempVoice.announce.gaveAway', { user: userMention(by), old: userMention(from), new: mention });
  // Pings the new owner, so they know the controls are theirs now
  return announce(temp, text, [member.id]);
}

/** The selects of a panel: who's let in, who's kept out, and someone who's here. */
export async function handleTempVoiceSelect(interaction: AnySelectMenuInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseTempVoiceCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
  const temp = await controlledChannel(interaction, parsed.channelId, MODERATOR_ACTIONS.includes(parsed.action), t);
  if (!temp) return;

  // Picking sets the whole list, so leaving someone out takes them off it. Who can't be on it is left off, and whoever picked is told why
  if ((parsed.action === 'moderators' || parsed.action === 'allow' || parsed.action === 'block') && interaction.isUserSelectMenu()) {
    const list = parsed.action;
    /** Why someone can't be on the list, or null if they can. */
    const reason = (id: string): 'bot' | 'owner' | 'staff' | 'moderator' | null => {
      if (interaction.users.get(id)?.bot) return 'bot';
      // The owner is always let in and can do everything already
      if (id === temp.record.ownerId) return 'owner';
      if (list !== 'block') return null;
      // Staff are always let through, and moderators always let in, so keeping them out wouldn't do anything
      const member = interaction.members.get(id);
      if (member && isStaff(member)) return 'staff';
      return temp.record.moderators.includes(id) ? 'moderator' : null;
    };

    const ids: string[] = [];
    const skipped = new Map<'bot' | 'owner' | 'staff' | 'moderator', string[]>();
    for (const id of interaction.users.keys()) {
      const why = reason(id);
      if (why) skipped.set(why, [...(skipped.get(why) ?? []), id]);
      else ids.push(id);
    }

    await interaction.deferUpdate();
    const field = list === 'moderators' ? 'moderators' : list === 'allow' ? 'allowed' : 'blocked';
    // The picker only shows the first ones of a long list, so those after them weren't there to unpick and stay on it
    const change = (record: { allowed: string[]; blocked: string[]; moderators: string[] }) => ({
      [field]: [...new Set([...ids, ...record[field].slice(MAX_PICKED)])],
    });
    await showChanged(interaction, temp, await changeTempChannel(temp, interaction.member, change), t);
    if (skipped.size > 0) {
      const lines = [...skipped].map(([why, users]) =>
        t(`tempVoice.skipped.${why}`, { users: users.map((id) => userMention(id)).join(', '), count: users.length }),
      );
      await interaction.followUp({
        // Says which list it's about, as the message shows up apart from the panel
        ...createResponse([t(`tempVoice.skipped.title.${list}`), ...lines.map((line) => `- ${line}`)].join('\n'), 'warning'),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        allowedMentions: { parse: [] },
      });
    }
    return;
  }
  if (parsed.action === 'member' && interaction.isStringSelectMenu()) {
    const target = interaction.values[0] ?? '';
    const button = (action: TempVoiceAction, label: string, style: ButtonStyle) =>
      new ButtonBuilder()
        .setCustomId(tempVoiceCustomId(action, temp.channel.id, target))
        .setLabel(label)
        .setStyle(style);
    const question = createResponse(t('tempVoice.member.question', { user: userMention(target) }));
    return interaction.reply({
      components: [
        ...(question.components ?? []),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          // Handing it over is the owner's, so moderators don't get the button
          ...(canChange(interaction.member, temp) ? [button('handover', t('tempVoice.member.handover'), ButtonStyle.Primary)] : []),
          button('kick', t('tempVoice.member.kick'), ButtonStyle.Secondary),
          button('keepout', t('tempVoice.member.keepout'), ButtonStyle.Danger),
        ),
      ],
      flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
      allowedMentions: { parse: [] },
    });
  }
  return sendError(interaction, t('system.outdated'));
}

/** The popup to rename a channel, set its limit, or both. */
export async function handleTempVoiceModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  if (!interaction.inCachedGuild() || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));
  // Popups from before the name and limit were apart have no kind, and change both
  const [channelId = '', kind = 'both'] = interaction.customId.slice(TEMP_VOICE_EDIT_MODAL_PREFIX.length).split(':');
  // Moderators can set the limit, but only the owner can rename it
  const temp = await controlledChannel(interaction, channelId, kind === 'limit', t);
  if (!temp) return;
  const change: Change = {};

  if (kind !== 'name') {
    // Left empty, there's no limit, as with 0
    const limitText = interaction.fields.getTextInputValue(LIMIT_INPUT_ID).trim() || '0';
    change.userLimit = Number(limitText);
    if (!/^\d+$/.test(limitText) || change.userLimit > MAX_LIMIT) return sendError(interaction, t('tempVoice.edit.invalidLimit'));
  }

  await interaction.deferUpdate();
  if (kind !== 'limit') {
    // Left empty, it goes back to the owner's display name, not whoever's changing it, if that's staff
    const owner = await interaction.guild.members.fetch(temp.record.ownerId).catch(() => null);
    const prefix = temp.record.namePrefix;
    const label = channelLabel(prefix, interaction.fields.getTextInputValue(NAME_INPUT_ID)) || owner?.displayName || channelLabel(prefix, temp.channel.name);
    change.name = channelName(prefix, label);
  }
  return showChanged(interaction, temp, await changeTempChannel(temp, interaction.member, change), t);
}

/** /voice: the panel for the channel you're in, just for you. */
export async function showOwnPanel(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const temp = await findTempChannel(interaction.guild, interaction.member.voice.channelId);
  if (!temp) {
    const creators = (await getTempVoiceCreators(interaction.guildId)).filter((creator) => interaction.guild.channels.cache.has(creator.channelId));
    const join = creators.map((creator) => channelMention(creator.channelId)).join(', ');
    return sendError(interaction, creators.length > 0 ? t('tempVoice.controls.notInOneJoin', { channels: join }) : t('tempVoice.controls.notInOne'));
  }
  if (!canModerate(interaction.member, temp)) return sendError(interaction, t('tempVoice.controls.notOwner', { owner: userMention(temp.record.ownerId) }));
  const panel = buildPanel(temp, t);
  return interaction.reply({ ...panel, flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral], allowedMentions: { parse: [] } });
}
