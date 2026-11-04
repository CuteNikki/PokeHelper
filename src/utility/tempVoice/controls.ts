import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
  TimestampStyles,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { getTempVoiceCreators } from 'database/tempVoice';

import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { createResponse, sendError } from 'utility/response';
import {
  canChange,
  changeTempChannel,
  channelLabel,
  channelName,
  deleteTempChannel,
  findTempChannel,
  handOver,
  isStaff,
  maxLabelLength,
  type TempChannel,
} from 'utility/tempVoice/channel';
import {
  announce,
  buildPanel,
  parseTempVoiceCustomId,
  serverTranslate,
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
const DELETE_DELAY = 3_000;

/**
 * The channel a control is for, if whoever used it may change it. Otherwise answers why not.
 * @param channelId From the control's custom ID.
 */
async function controlledChannel(interaction: Control, channelId: string, t: Translate): Promise<TempChannel | null> {
  const temp = await findTempChannel(interaction.guild, channelId);
  if (!temp) {
    await sendError(interaction, t('tempVoice.controls.gone'));
    return null;
  }
  if (!canChange(interaction.member, temp)) {
    await sendError(interaction, t('tempVoice.controls.notOwner', { owner: `<@${temp.record.ownerId}>` }));
    return null;
  }
  return temp;
}

/** "Try again in …", for a channel Discord won't rename yet. */
const tryAgain = (retryAt: Date, t: Translate) => t('tempVoice.controls.renameLimit', { time: time(retryAt, TimestampStyles.RelativeTime) });

/**
 * After a change made from a panel, deferred with deferUpdate: shows that panel as it is now, and says so if Discord wouldn't rename
 * the channel yet. The panel in the channel's chat catches up on its own.
 */
async function showChanged(interaction: Control, temp: TempChannel, result: { retryAt: Date } | void, t: Translate) {
  if (result) await sendError(interaction, tryAgain(result.retryAt, t));
  // The panel is in the server's language in the channel's chat, and in the user's own where only they see it
  const panelT = interaction.message?.flags.has(MessageFlags.Ephemeral) ? t : serverTranslate(interaction.guild);
  await interaction.editReply(buildPanel(temp, panelT));
}

/** The popup to rename a channel and set its limit. */
function buildEditModal(temp: TempChannel, t: Translate) {
  const limit = new TextInputBuilder().setCustomId(LIMIT_INPUT_ID).setMaxLength(2).setStyle(TextInputStyle.Short).setRequired(false);
  // Empty while there's no limit, rather than a 0 to clear first
  if (temp.channel.userLimit) limit.setValue(String(temp.channel.userLimit));
  return new ModalBuilder()
    .setCustomId(`${TEMP_VOICE_EDIT_MODAL_PREFIX}${temp.channel.id}`)
    .setTitle(t('tempVoice.edit.title'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t('tempVoice.edit.name'))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(NAME_INPUT_ID)
            .setValue(channelLabel(temp.record.namePrefix, temp.channel.name))
            .setMaxLength(maxLabelLength(temp.record.namePrefix))
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      new LabelBuilder().setLabel(t('tempVoice.edit.limit')).setTextInputComponent(limit),
    );
}

/** The buttons of a panel, and of the question what to do about someone in the channel. */
export async function handleTempVoiceButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseTempVoiceCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
  const temp = await controlledChannel(interaction, parsed.channelId, t);
  if (!temp) return;

  switch (parsed.action) {
    case 'lock':
    case 'hide': {
      await interaction.deferUpdate();
      const change = parsed.action === 'lock' ? { locked: !temp.record.locked } : { hidden: !temp.record.hidden };
      return showChanged(interaction, temp, await changeTempChannel(temp, interaction.member, change), t);
    }
    case 'edit':
      return interaction.showModal(buildEditModal(temp, t));
    case 'delete': {
      await interaction.deferUpdate();
      await announce(temp, serverTranslate(interaction.guild)('tempVoice.announce.deleted', { user: `<@${interaction.user.id}>` }));
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

/** Hand over, kick or keep out someone, after picking them from the panel. Answered on the question, which only whoever picked sees. */
async function handleMemberAction(interaction: ButtonInteraction<'cached'>, temp: TempChannel, action: TempVoiceAction, memberId: string, t: Translate) {
  const answer = (text: string, kind: 'info' | 'error' = 'info') => interaction.editReply({ ...createResponse(text, kind), allowedMentions: { parse: [] } });
  const mention = `<@${memberId}>`;
  const serverT = serverTranslate(interaction.guild);
  await interaction.deferUpdate();

  if (action === 'kick') {
    const member = temp.channel.members.get(memberId);
    if (!member) return answer(t('tempVoice.member.alreadyLeft'));
    await member.voice.disconnect(`Kicked from a temporary voice channel by ${interaction.user.tag}`);
    await answer(t('tempVoice.member.kicked', { user: mention }));
    return announce(temp, serverT('tempVoice.announce.kicked', { user: `<@${interaction.user.id}>`, target: mention }));
  }

  if (action === 'keepout') {
    if (memberId === temp.record.ownerId) return answer(t('tempVoice.member.ownerCantBeBlocked'), 'error');
    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
    if (member && isStaff(member)) return answer(t('tempVoice.member.staffCantBeBlocked'), 'error');
    await changeTempChannel(temp, interaction.member, (record) => ({ blocked: [...new Set([...record.blocked, memberId])] }));
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
      ? serverT('tempVoice.announce.handedOver', { old: `<@${from}>`, new: mention })
      : by === member.id
        ? serverT('tempVoice.announce.tookOver', { old: `<@${from}>`, new: mention })
        : serverT('tempVoice.announce.gaveAway', { user: `<@${by}>`, old: `<@${from}>`, new: mention });
  // Pings the new owner, so they know the controls are theirs now
  return announce(temp, text, [member.id]);
}

/** The selects of a panel: who's let in, who's kept out, and someone who's here. */
export async function handleTempVoiceSelect(interaction: AnySelectMenuInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const parsed = parseTempVoiceCustomId(interaction.customId);
  if (!parsed || !interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
  const temp = await controlledChannel(interaction, parsed.channelId, t);
  if (!temp) return;

  // Picking sets the whole list, so leaving someone out takes them off it
  if (parsed.action === 'allow' && interaction.isUserSelectMenu()) {
    await interaction.deferUpdate();
    const allowed = interaction.users.filter((user) => !user.bot).map((user) => user.id);
    return showChanged(interaction, temp, await changeTempChannel(temp, interaction.member, { allowed }), t);
  }
  if (parsed.action === 'block' && interaction.isUserSelectMenu()) {
    await interaction.deferUpdate();
    // Staff are always let through, so keeping them out wouldn't do anything
    const blocked = interaction.members.filter((member) => !member.user.bot && !isStaff(member)).map((member) => member.id);
    return showChanged(interaction, temp, await changeTempChannel(temp, interaction.member, { blocked }), t);
  }
  if (parsed.action === 'member' && interaction.isStringSelectMenu()) {
    const target = interaction.values[0] ?? '';
    const button = (action: TempVoiceAction, label: string, style: ButtonStyle) =>
      new ButtonBuilder()
        .setCustomId(tempVoiceCustomId(action, temp.channel.id, target))
        .setLabel(label)
        .setStyle(style);
    const question = createResponse(t('tempVoice.member.question', { user: `<@${target}>` }));
    return interaction.reply({
      components: [
        ...(question.components ?? []),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('handover', t('tempVoice.member.handover'), ButtonStyle.Primary),
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

/** The popup to rename a channel and set its limit. */
export async function handleTempVoiceModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  if (!interaction.inCachedGuild() || !interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));
  const temp = await controlledChannel(interaction, interaction.customId.slice(TEMP_VOICE_EDIT_MODAL_PREFIX.length), t);
  if (!temp) return;

  // Left empty, there's no limit, as with 0
  const limitText = interaction.fields.getTextInputValue(LIMIT_INPUT_ID).trim() || '0';
  const limit = Number(limitText);
  if (!/^\d+$/.test(limitText) || limit > MAX_LIMIT) return sendError(interaction, t('tempVoice.edit.invalidLimit'));

  await interaction.deferUpdate();
  // Left empty, it goes back to the owner's display name, not whoever's changing it, if that's staff
  const owner = await interaction.guild.members.fetch(temp.record.ownerId).catch(() => null);
  const prefix = temp.record.namePrefix;
  const label = channelLabel(prefix, interaction.fields.getTextInputValue(NAME_INPUT_ID)) || owner?.displayName || channelLabel(prefix, temp.channel.name);
  const result = await changeTempChannel(temp, interaction.member, { name: channelName(prefix, label), userLimit: limit });
  return showChanged(interaction, temp, result, t);
}

/** /voice: the panel for the channel you're in, just for you. */
export async function showOwnPanel(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const temp = await findTempChannel(interaction.guild, interaction.member.voice.channelId);
  if (!temp) {
    const creators = (await getTempVoiceCreators(interaction.guildId)).filter((creator) => interaction.guild.channels.cache.has(creator.channelId));
    const join = creators.map((creator) => `<#${creator.channelId}>`).join(', ');
    return sendError(interaction, creators.length > 0 ? t('tempVoice.controls.notInOneJoin', { channels: join }) : t('tempVoice.controls.notInOne'));
  }
  if (!canChange(interaction.member, temp)) return sendError(interaction, t('tempVoice.controls.notOwner', { owner: `<@${temp.record.ownerId}>` }));
  const panel = buildPanel(temp, t);
  return interaction.reply({ ...panel, flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral], allowedMentions: { parse: [] } });
}
