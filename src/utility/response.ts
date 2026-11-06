import {
  AttachmentBuilder,
  type BaseMessageOptions,
  ContainerBuilder,
  MediaGalleryBuilder,
  type Message,
  MessageFlags,
  type RepliableInteraction,
  TextDisplayBuilder,
} from 'discord.js';
import { t } from 'i18next';

import { DiscordLimits } from 'utility/discordLimits';
import { logger } from 'utility/logger';
import { ThemeColors, type ResponseKind } from 'utility/theme';

/**
 * A Components V2 message payload. Can be passed to `channel.send`, `interaction.update` and the like,
 * or to {@link sendResponse} for interactions.
 */
export type ResponsePayload = Pick<BaseMessageOptions, 'components' | 'files' | 'allowedMentions'> & {
  flags: [MessageFlags.IsComponentsV2];
};

/** A Components V2 message with one text container, in the accent color of its kind. */
export const createResponse = (content: string, kind: ResponseKind = 'info'): ResponsePayload => ({
  components: [new ContainerBuilder().setAccentColor(ThemeColors[kind]).addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
  flags: [MessageFlags.IsComponentsV2],
});

/**
 * A picture for a message, with what's on it as its description, which screen readers read out, as the picture is only pixels.
 * @returns The gallery to put in the message, and the file to send with it.
 */
export function imageWithDescription(name: string, image: Buffer, description: string) {
  const gallery = new MediaGalleryBuilder().addItems((item) =>
    item.setURL(`attachment://${name}`).setDescription(description.slice(0, DiscordLimits.mediaDescriptionLength)),
  );
  return { gallery, file: new AttachmentBuilder(image, { name }) };
}

/** A message with a notice above it, like a success message above the list it led back to. */
export const withNotice = (content: string, kind: ResponseKind, payload: ResponsePayload): ResponsePayload => ({
  ...payload,
  components: [...(createResponse(content, kind).components ?? []), ...(payload.components ?? [])],
});

/**
 * Send a response to an interaction, picking `reply`, `editReply` or `followUp` based on its state.
 * Never throws: failures are logged and `null` is returned.
 *
 * Ephemeral only applies to `reply` and `followUp`. After `deferReply`, the visibility chosen there is kept.
 */
export async function sendResponse(
  interaction: RepliableInteraction,
  payload: ResponsePayload,
  { ephemeral = false }: { ephemeral?: boolean } = {},
): Promise<Message | null> {
  // A combined bitfield, as an array literal here would widen to MessageFlags[] which the reply options reject
  const flags = MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0);

  // deferUpdate on a button, select or popup means "I'll edit the message it's on", so editReply would replace that message,
  // like a leaderboard, with the response. Only deferReply sets `ephemeral`, which tells the two apart
  const deferredUpdate = interaction.deferred && interaction.ephemeral === null && (interaction.isMessageComponent() || interaction.isModalSubmit());

  try {
    if (interaction.deferred && !interaction.replied && !deferredUpdate) {
      return await interaction.editReply(payload);
    }
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp({ ...payload, flags });
    }
    const response = await interaction.reply({ ...payload, flags, withResponse: true });
    return response.resource?.message ?? null;
  } catch (error) {
    logger.error(error, t('system.response.failed', { id: interaction.id, user: interaction.user.id }));
    return null;
  }
}

/** An error only whoever used it sees. Never throws. */
export const sendError = (interaction: RepliableInteraction, content: string) =>
  sendResponse(interaction, createResponse(content, 'error'), { ephemeral: true });

/**
 * Returns a catch handler that logs the error with a message, for promises whose failure shouldn't stop the caller.
 * Use this instead of `.catch(() => null)` when the failure is unexpected and worth knowing about.
 * @example
 * await message.delete().catch(logFailure('Failed to delete counting message'));
 */
export const logFailure =
  (message: string) =>
  (error: unknown): null => {
    logger.error(error, message);
    return null;
  };

/**
 * Replace a public "thinking" reply with an error only the user sees, for commands whose answer would have been public.
 * A follow-up, as a deleted reply can't be edited, and `sendResponse` would try to. Never throws.
 */
export async function replaceWithError(interaction: RepliableInteraction, content: string): Promise<Message | null> {
  await interaction.deleteReply().catch(() => null);
  try {
    return await interaction.followUp({ ...createResponse(content, 'error'), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  } catch (error) {
    logger.error(error, t('system.response.failed', { id: interaction.id, user: interaction.user.id }));
    return null;
  }
}
