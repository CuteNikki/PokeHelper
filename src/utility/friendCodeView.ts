import {
  ActionRowBuilder,
  bold,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ContainerBuilder,
  escapeMarkdown,
  type GuildMember,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type User,
} from 'discord.js';

import { getFriendCodes } from 'database/friendCodes';

import { friendCodeSettings } from 'settings/friendCodes';

import { buttonIcon } from 'utility/emojis';
import { formatFriendCode, savedFriendCodes } from 'utility/friendCodes';
import { getTranslate, type Translate } from 'utility/i18next';
import { buildCopyModal } from 'utility/modal';
import { createResponse, messageOf, quietMessageOf, type ResponsePayload, sendError, sendResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

/** The buttons under someone's friend codes are `friendcodes:copy:<user>` and `friendcodes:edit`, so they work however old the message is. */
export const FRIEND_CODES_PREFIX = 'friendcodes:';
const COPY_ID = `${FRIEND_CODES_PREFIX}copy:`;
const EDIT_ID = `${FRIEND_CODES_PREFIX}edit`;
/** The popup with the codes to copy. Nothing is saved from it, closing it is all there is to do. */
export const FRIEND_CODES_COPY_MODAL_ID = 'friendcodes-copy';

/** Someone's friend codes, with a copy button (text in messages can't be selected on phones) and one to add your own. */
export async function buildFriendCodes(user: User, member: GuildMember | null, self: boolean, t: Translate): Promise<ResponsePayload> {
  const codes = savedFriendCodes(await getFriendCodes(user.id));
  const name = escapeMarkdown(member?.displayName ?? user.displayName);

  if (codes.length === 0 && !self) return { ...createResponse(t('friendCodes.view.none', { name })), allowedMentions: { parse: [] } };
  if (codes.length === 0) {
    const container = new ContainerBuilder()
      .setAccentColor(ThemeColors.info)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('friendCodes.view.noneSelf')))
      .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(editButton(t)));
    return messageOf(container);
  }

  const lines = codes.map(({ game, code }) => `${bold(t(`friendCodes.games.${game}`))} · \`${formatFriendCode(game, code)}\``);
  const avatar = (member ?? user).displayAvatarURL({ extension: 'png', size: 128 });
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('friendCodes.view.title', { name })}\n${lines.join('\n')}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${COPY_ID}${user.id}`)
          .setLabel(t('friendCodes.view.copy'))
          .setEmoji(buttonIcon('copy'))
          .setStyle(ButtonStyle.Secondary),
        editButton(t),
      ),
    );
  return quietMessageOf(container);
}

/** Opens the codes of whoever presses it, to add or change them, also under someone else's. */
const editButton = (t: Translate) =>
  new ButtonBuilder().setCustomId(EDIT_ID).setLabel(t('friendCodes.view.yours')).setEmoji(buttonIcon('pencil')).setStyle(ButtonStyle.Secondary);

export async function handleFriendCodesButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);

  if (interaction.customId === EDIT_ID) {
    // Answered before the codes are loaded, which can take a moment, as Discord gives up after 3 seconds
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    return sendResponse(interaction, await friendCodeSettings.render(settingsContext(interaction), t));
  }

  // The codes as they're saved now, which may have changed since the message was sent
  const codes = interaction.customId.startsWith(COPY_ID) ? savedFriendCodes(await getFriendCodes(interaction.customId.slice(COPY_ID.length))) : [];
  if (codes.length === 0) return sendError(interaction, t('friendCodes.view.gone'));

  // Only the digits, which is what the games take when pasted
  const fields = codes.map(({ game, code }) => ({ id: game, label: t(`friendCodes.games.${game}`), value: code }));
  return interaction.showModal(buildCopyModal(FRIEND_CODES_COPY_MODAL_ID, t('friendCodes.view.copyTitle'), fields));
}
