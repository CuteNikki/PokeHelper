import {
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import { getTranslate, type Translate } from 'utility/i18next';
import { sendError } from 'utility/response';

/**
 * The Copy IDs button of a log entry, which opens a popup with the IDs filled in, as text in a message can't be selected on phones.
 * Its custom ID is `logids:` followed by the IDs, like `u123.m456`, so it works however old the entry is.
 */
export const COPY_IDS_PREFIX = 'logids:';
/** The popup's custom ID. Nothing is saved from it, closing it is all there is to do. */
export const COPY_IDS_MODAL_ID = 'logids-modal';

/** The kinds of IDs, each with the letter it's kept as in the button. */
const ID_KINDS = { user: 'u', message: 'm', channel: 'c', role: 'r', server: 's', emoji: 'e', sticker: 'k', invite: 'i' } as const;
export type IdKind = keyof typeof ID_KINDS;
export type LogIds = Partial<Record<IdKind, string>>;

/** Custom IDs fit 100 characters, room for four IDs. */
const MAX_IDS = 4;

/** The Copy IDs button for these IDs, or null if there are none. */
export function copyIdsButton(ids: LogIds, t: Translate): ButtonBuilder | null {
  const parts = (Object.entries(ids) as [IdKind, string][]).slice(0, MAX_IDS).map(([kind, id]) => `${ID_KINDS[kind]}${id}`);
  if (parts.length === 0) return null;
  return new ButtonBuilder()
    .setCustomId(`${COPY_IDS_PREFIX}${parts.join('.')}`)
    .setLabel(t('logs.copy.button'))
    .setEmoji('📋')
    .setStyle(ButtonStyle.Secondary);
}

/** The IDs in a Copy IDs button's custom ID. */
export function parseCopyIds(customId: string): [IdKind, string][] {
  const kinds = Object.entries(ID_KINDS) as [IdKind, string][];
  return customId
    .slice(COPY_IDS_PREFIX.length)
    .split('.')
    .map((part) => [kinds.find(([, letter]) => letter === part[0])?.[0], part.slice(1)] as const)
    .filter((entry): entry is [IdKind, string] => entry[0] !== undefined && entry[1] !== '');
}

/** Show the IDs in a popup, each in a field to copy from. In the language of whoever pressed it. */
export async function showCopyIds(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const ids = parseCopyIds(interaction.customId);
  if (ids.length === 0) return sendError(interaction, t('system.outdated'));

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(COPY_IDS_MODAL_ID)
      .setTitle(t('logs.copy.title'))
      .addLabelComponents(
        ids.map(([kind, id]) =>
          new LabelBuilder()
            .setLabel(t(`logs.copy.${kind}`))
            .setTextInputComponent(new TextInputBuilder().setCustomId(kind).setStyle(TextInputStyle.Short).setValue(id).setRequired(false)),
        ),
      ),
  );
}

/** Closing the popup with its button sends it, which only needs an answer. */
export const closeCopyIds = (interaction: ModalSubmitInteraction) => interaction.deferUpdate();
