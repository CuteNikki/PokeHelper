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

/**
 * The kinds of IDs, each with the letter it's kept as in the button, in the order they're shown: who it's about, who did it, then
 * where and what. `by` is who did it, added from the entry's By on its own.
 */
const ID_KINDS = { user: 'u', by: 'b', channel: 'c', message: 'm', role: 'r', server: 's', emoji: 'e', sticker: 'k', invite: 'i' } as const;
export type IdKind = keyof typeof ID_KINDS;
/** The IDs of an entry by what they are. Roles and channels can be several, like the roles someone was given, or where someone moved from and to. */
export type LogIds = Partial<Record<Exclude<IdKind, 'role' | 'channel'>, string>> & { role?: string | string[]; channel?: string | string[] };

/** Discord's limit for custom IDs. The IDs that don't fit are left out, the first ones are the ones most often wanted. */
const MAX_CUSTOM_ID = 100;
/** A popup fits five fields. */
const MAX_FIELDS = 5;

/** The Copy IDs button for these IDs, or null if there are none. */
export function copyIdsButton(ids: LogIds, t: Translate): ButtonBuilder | null {
  const entries = (Object.keys(ID_KINDS) as IdKind[]).flatMap((kind) => [ids[kind] ?? []].flat().map((id) => `${ID_KINDS[kind]}${id}`));
  const parts: string[] = [];
  for (const part of [...new Set(entries)].slice(0, MAX_FIELDS)) {
    if (COPY_IDS_PREFIX.length + [...parts, part].join('.').length > MAX_CUSTOM_ID) break;
    parts.push(part);
  }
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
        ids.map(([kind, id], index) => {
          // The name too, to tell apart several of a kind, like the member and who did it, or several roles
          const name = nameOf(interaction, kind, id);
          return new LabelBuilder()
            .setLabel((name ? `${t(`logs.copy.${kind}`)} · ${name}` : t(`logs.copy.${kind}`)).slice(0, MAX_LABEL))
            .setTextInputComponent(new TextInputBuilder().setCustomId(`${kind}${index}`).setStyle(TextInputStyle.Short).setValue(id).setRequired(false));
        }),
      ),
  );
}

/** Discord's limit for a field's label. */
const MAX_LABEL = 45;

/** What an ID is called, as far as the bot knows it, like a username or a role's name. */
function nameOf(interaction: ButtonInteraction, kind: IdKind, id: string): string | null {
  const { guild, client } = interaction;
  switch (kind) {
    case 'user':
    case 'by':
      return client.users.cache.get(id)?.username ?? null;
    case 'role':
      return guild?.roles.cache.get(id)?.name ?? null;
    case 'channel': {
      const channel = guild?.channels.cache.get(id);
      return channel ? `#${channel.name}` : null;
    }
    default:
      return null;
  }
}

/** Closing the popup with its button sends it, which only needs an answer. */
export const closeCopyIds = (interaction: ModalSubmitInteraction) => interaction.deferUpdate();
