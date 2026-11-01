import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';

import { ThemeColors } from 'utility/theme';

/** How long a confirmation waits for an answer, in milliseconds. */
const CONFIRM_TIME = 30_000;

/**
 * Ask the user to confirm something that can't be undone, with a confirm and a cancel button, in the deferred reply.
 * @returns The button interaction when confirmed, deferred so the caller can edit the reply, or null when cancelled or not answered in time.
 *   When cancelled or timed out, the reply already shows `cancelled`.
 */
export async function confirmAction(
  interaction: ChatInputCommandInteraction,
  text: { question: string; confirm: string; cancel: string; cancelled: string },
): Promise<ButtonInteraction | null> {
  // Custom IDs include the interaction ID, so they can't be confused with another confirmation
  const confirmId = `confirm_${interaction.id}`;
  const cancelId = `cancel_${interaction.id}`;

  const message = await interaction.editReply({
    components: [
      new ContainerBuilder()
        .setAccentColor(ThemeColors.warning)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.question))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(confirmId).setLabel(text.confirm).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(cancelId).setLabel(text.cancel).setStyle(ButtonStyle.Secondary),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  });

  const choice = await message
    .awaitMessageComponent({ componentType: ComponentType.Button, time: CONFIRM_TIME, filter: (i) => i.user.id === interaction.user.id })
    .catch(() => null);

  if (choice?.customId === confirmId) {
    await choice.deferUpdate();
    return choice;
  }

  const cancelled = {
    components: [new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(text.cancelled))],
    flags: [MessageFlags.IsComponentsV2] as const,
  };
  // Cancel pressed: answer that button. No answer in time: there's no button to answer, so edit the reply
  if (choice) await choice.update(cancelled);
  else await interaction.editReply(cancelled);
  return null;
}
