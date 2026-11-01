import { ContainerBuilder, MessageFlags, TextDisplayBuilder, type BaseMessageOptions, type Message, type RepliableInteraction } from 'discord.js';
import { t } from 'i18next';

import { logger } from 'utility/logger';
import { ThemeColors, type ResponseKind } from 'utility/theme';

/**
 * A Components V2 message payload. Can be passed to `channel.send`, `interaction.update` and the like,
 * or to {@link sendResponse} for interactions.
 */
export type ResponsePayload = Pick<BaseMessageOptions, 'components' | 'files' | 'allowedMentions'> & {
  flags: [MessageFlags.IsComponentsV2];
};

/**
 * Create a Components V2 payload with a single text container.
 * @param content The text to show in the container.
 * @param kind The kind of response, which decides the accent color. Defaults to `info`.
 */
export const createResponse = (content: string, kind: ResponseKind = 'info'): ResponsePayload => ({
  components: [new ContainerBuilder().setAccentColor(ThemeColors[kind]).addTextDisplayComponents(new TextDisplayBuilder().setContent(content))],
  flags: [MessageFlags.IsComponentsV2],
});

/**
 * Send a response to an interaction, picking `reply`, `editReply` or `followUp` based on its state.
 * Never throws: failures are logged and `null` is returned.
 *
 * Ephemeral only applies to `reply` and `followUp`. After `deferReply`, the visibility chosen there is kept.
 * @param interaction The interaction to respond to.
 * @param payload The payload to send, usually from {@link createResponse}.
 * @param options.ephemeral Whether the response should only be visible to the user. Defaults to false.
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

/**
 * Shortcut for sending an ephemeral error response to an interaction. Never throws.
 * @param interaction The interaction to respond to.
 * @param content The error message to show.
 */
export const sendError = (interaction: RepliableInteraction, content: string) =>
  sendResponse(interaction, createResponse(content, 'error'), { ephemeral: true });

/**
 * Returns a catch handler that logs the error with a message, for promises whose failure shouldn't stop the caller.
 * Use this instead of `.catch(() => null)` when the failure is unexpected and worth knowing about.
 * @param message The message to log alongside the error.
 * @example
 * await message.delete().catch(logFailure('Failed to delete counting message'));
 */
export const logFailure =
  (message: string) =>
  (error: unknown): null => {
    logger.error(error, message);
    return null;
  };
