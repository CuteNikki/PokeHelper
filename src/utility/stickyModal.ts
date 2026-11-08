import { channelMention, type Guild, MessageFlags, type ModalSubmitInteraction, type PermissionsString } from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import { MAX_STICKIES, saveSticky } from 'database/sticky';

import { formatPermissions } from 'utility/discord';
import { formatNumber } from 'utility/duration';
import { getTranslate, type Translate } from 'utility/i18next';
import { buildTextModal } from 'utility/modal';
import { createResponse, sendError, sendResponse, withNotice } from 'utility/response';
import { missingBotPermissions } from 'utility/settings';
import { addStickyChannel, MAX_STICKY_LENGTH, postStickyNow, removeSticky, runStickyTask, STICKY_MODAL_PREFIX, STICKY_TEXT_INPUT_ID } from 'utility/sticky';
import { renderStickyList } from 'utility/stickyList';
import type { ResponseKind } from 'utility/theme';

/** The permissions the bot needs to post a sticky message, in a thread or another channel. */
export const stickyPermissions = (isThread: boolean): PermissionsString[] => ['ViewChannel', isThread ? 'SendMessagesInThreads' : 'SendMessages'];

/** Why the bot can't post a sticky message in a channel, or null if it can. */
export function stickyChannelProblem(guild: Guild, channelId: string, isThread: boolean, t: Translate): string | null {
  const missing = missingBotPermissions(guild, channelId, stickyPermissions(isThread));
  if (missing.length === 0) return null;
  return t('settings.channel.botPermissionsRefused', { channel: channelMention(channelId), permissions: formatPermissions(missing, t) });
}

/** The popup a channel's sticky message is written in. Emptying it removes the sticky. */
export const buildStickyModal = (channelId: string, text: string | undefined, t: Translate) =>
  buildTextModal({
    // A new ID each time, as Discord fills a popup with what was last typed in one with the same ID, like an emptied text
    customId: `${STICKY_MODAL_PREFIX}${channelId}:${Date.now().toString(36)}`,
    title: t('sticky.modal.title'),
    label: t('sticky.modal.label'),
    inputId: STICKY_TEXT_INPUT_ID,
    maxLength: MAX_STICKY_LENGTH,
    placeholder: t(text ? 'sticky.modal.placeholderRemove' : 'sticky.modal.placeholder'),
    value: text,
    optional: Boolean(text),
    paragraph: true,
  });

/** The popup was sent: save the sticky message and put it at the bottom of its channel, or remove it if it was emptied. */
export async function handleStickyModal(interaction: ModalSubmitInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  if (!interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
  // Popups from before they had a time after the channel have only the channel
  const [channelId = ''] = interaction.customId.slice(STICKY_MODAL_PREFIX.length).split(':');
  const channel = interaction.guild.channels.cache.get(channelId);
  const text = interaction.fields.getTextInputValue(STICKY_TEXT_INPUT_ID).trim();
  const mention = channelMention(channelId);

  // Opened from the list, the list shows what happened above it, up to date. From /sticky set, it's an answer of its own
  const fromList = interaction.isFromMessage();
  const answer = async (content: string, kind: ResponseKind) =>
    fromList
      ? interaction.editReply(withNotice(content, kind, await renderStickyList(interaction.guild, t)))
      : sendResponse(interaction, createResponse(content, kind));
  const defer = () => (fromList ? interaction.deferUpdate() : interaction.deferReply({ flags: [MessageFlags.Ephemeral] }));

  if (!text) {
    await defer();
    const removed = await runStickyTask(channelId, () => removeSticky(channelId, channel?.isTextBased() ? channel : undefined));
    return removed ? answer(t('sticky.remove.done', { channel: mention }), 'success') : answer(t('sticky.set.empty'), 'error');
  }
  if (!channel?.isTextBased()) return sendError(interaction, t('sticky.set.gone'));
  // Checked again, as permissions can change while the popup is open
  const problem = stickyChannelProblem(interaction.guild, channelId, channel.isThread(), t);
  if (problem) return sendError(interaction, problem);

  await defer();
  const saved = await saveSticky(interaction.guildId, channelId, text);
  if (!saved) return answer(t('sticky.set.full', { max: formatNumber(MAX_STICKIES, t) }), 'error');
  addStickyChannel(channelId);

  // Kept for when they're turned on again
  if (!(await getFeatureSwitches(interaction.guildId)).stickiesEnabled) return answer(t('sticky.set.turnedOff', { channel: mention }), 'warning');
  if (!(await postStickyNow(interaction.client, channelId, true))) return answer(t('sticky.set.notPosted', { channel: mention }), 'warning');
  return answer(t(saved.changed ? 'sticky.set.changed' : 'sticky.set.done', { channel: mention }), 'success');
}
