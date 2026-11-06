import { channelMention, type Guild, MessageFlags, type ModalSubmitInteraction, type PermissionsString } from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import { MAX_STICKIES, saveSticky } from 'database/sticky';

import { formatNumber } from 'utility/duration';
import { getTranslate, type Translate } from 'utility/i18next';
import { buildTextModal } from 'utility/modal';
import { createResponse, sendError, sendResponse } from 'utility/response';
import { formatPermissions, missingBotPermissions } from 'utility/settings';
import { addStickyChannel, MAX_STICKY_LENGTH, postStickyNow, STICKY_MODAL_PREFIX, STICKY_TEXT_INPUT_ID } from 'utility/sticky';

/** The permissions the bot needs to post a sticky message, in a thread or another channel. */
export const stickyPermissions = (isThread: boolean): PermissionsString[] => ['ViewChannel', isThread ? 'SendMessagesInThreads' : 'SendMessages'];

/** Why the bot can't post a sticky message in a channel, or null if it can. */
export function stickyChannelProblem(guild: Guild, channelId: string, isThread: boolean, t: Translate): string | null {
  const missing = missingBotPermissions(guild, channelId, stickyPermissions(isThread));
  if (missing.length === 0) return null;
  return t('settings.channel.botPermissionsRefused', { channel: channelMention(channelId), permissions: formatPermissions(missing, t) });
}

/** The popup a channel's sticky message is written in, with its text if it has one, to change it. */
export const buildStickyModal = (channelId: string, text: string | undefined, t: Translate) =>
  buildTextModal({
    customId: `${STICKY_MODAL_PREFIX}${channelId}`,
    title: t('sticky.modal.title'),
    label: t('sticky.modal.label'),
    inputId: STICKY_TEXT_INPUT_ID,
    maxLength: MAX_STICKY_LENGTH,
    placeholder: t('sticky.modal.placeholder'),
    value: text,
    paragraph: true,
  });

/** The popup was sent: save the sticky message and put it at the bottom of its channel. */
export async function handleStickyModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  if (!interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
  const channelId = interaction.customId.slice(STICKY_MODAL_PREFIX.length);
  const channel = interaction.guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return sendError(interaction, t('sticky.set.gone'));

  const text = interaction.fields.getTextInputValue(STICKY_TEXT_INPUT_ID).trim();
  if (!text) return sendError(interaction, t('sticky.set.empty'));
  // Checked again, as permissions can change while the popup is open
  const problem = stickyChannelProblem(interaction.guild, channelId, channel.isThread(), t);
  if (problem) return sendError(interaction, problem);

  // Posting it can take a moment
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const saved = await saveSticky(interaction.guildId, channelId, text);
  if (!saved) return sendError(interaction, t('sticky.set.full', { max: formatNumber(MAX_STICKIES, t) }));
  addStickyChannel(channelId);

  const mention = channelMention(channelId);
  // Kept for when they're turned on again
  if (!(await getFeatureSwitches(interaction.guildId)).stickiesEnabled) {
    return sendResponse(interaction, createResponse(t('sticky.set.turnedOff', { channel: mention }), 'warning'));
  }
  if (!(await postStickyNow(interaction.client, channelId, true))) {
    return sendResponse(interaction, createResponse(t('sticky.set.notPosted', { channel: mention }), 'warning'));
  }
  return sendResponse(interaction, createResponse(t(saved.changed ? 'sticky.set.changed' : 'sticky.set.done', { channel: mention }), 'success'));
}
