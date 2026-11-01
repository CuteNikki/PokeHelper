import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';

import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/**
 * Custom IDs of confirmation buttons are `confirm:<action>:yes` or `confirm:<action>:no`.
 * What happens on confirm is looked up by the action in `utility/confirmations`, so the buttons work however late they're clicked.
 */
export const CONFIRM_CUSTOM_ID_PREFIX = 'confirm:';

/**
 * A question with a confirm and a cancel button, for something that can't be undone.
 * @param action What happens when confirmed, one of the actions in `utility/confirmations`.
 */
export function buildConfirmation(action: string, text: { question: string; confirm: string; cancel: string }): ResponsePayload {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ThemeColors.warning)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.question))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`${CONFIRM_CUSTOM_ID_PREFIX}${action}:yes`).setLabel(text.confirm).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`${CONFIRM_CUSTOM_ID_PREFIX}${action}:no`).setLabel(text.cancel).setStyle(ButtonStyle.Secondary),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  };
}

/** The action and answer of a confirmation button, or null if it isn't one. */
export function parseConfirmation(customId: string): { action: string; confirmed: boolean } | null {
  if (!customId.startsWith(CONFIRM_CUSTOM_ID_PREFIX)) return null;
  const [action, answer] = customId.slice(CONFIRM_CUSTOM_ID_PREFIX.length).split(':');
  if (!action || (answer !== 'yes' && answer !== 'no')) return null;
  return { action, confirmed: answer === 'yes' };
}
