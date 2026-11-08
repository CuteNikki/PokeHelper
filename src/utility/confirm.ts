import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js';

import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** Custom IDs are `confirm:<action>:yes|no`. The action is looked up in `utility/confirmations`, so the buttons work however late they're clicked. */
export const CONFIRM_CUSTOM_ID_PREFIX = 'confirm:';

/** A confirm/cancel question with custom IDs given, for buttons that carry what they're about, like the role menu they delete. */
export function buildQuestion(text: { question: string; confirm: string; cancel: string }, ids: { confirm: string; cancel: string }): ResponsePayload {
  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(ThemeColors.warning)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.question))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(ids.confirm).setLabel(text.confirm).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(ids.cancel).setLabel(text.cancel).setStyle(ButtonStyle.Secondary),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  };
}

/** A confirm/cancel question for something that can't be undone. `action` is one of `utility/confirmations`. */
export const buildConfirmation = (action: string, text: { question: string; confirm: string; cancel: string }) =>
  buildQuestion(text, { confirm: `${CONFIRM_CUSTOM_ID_PREFIX}${action}:yes`, cancel: `${CONFIRM_CUSTOM_ID_PREFIX}${action}:no` });

/** The action and answer of a confirmation button, or null if it isn't one. */
export function parseConfirmation(customId: string): { action: string; confirmed: boolean } | null {
  if (!customId.startsWith(CONFIRM_CUSTOM_ID_PREFIX)) return null;
  const [action, answer] = customId.slice(CONFIRM_CUSTOM_ID_PREFIX.length).split(':');
  if (!action || (answer !== 'yes' && answer !== 'no')) return null;
  return { action, confirmed: answer === 'yes' };
}
