import { LabelBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type AnySelectMenuInteraction, type ButtonInteraction } from 'discord.js';
import { t } from 'i18next';

import { countingSettings } from 'settings/counting';

import { createResponse, sendError } from 'utility/response';
import { parseSettingsCustomId, type SettingsInput, type SettingsModal, type SettingsPanel } from 'utility/settings';

/** Every settings panel, so their buttons and selects can find them by ID. */
const panels: SettingsPanel[] = [countingSettings];

/** How long a settings popup waits to be submitted, in milliseconds. */
const MODAL_TIME = 120_000;
const MODAL_INPUT_ID = 'value';

export const getSettingsPanel = (id: string) => panels.find((panel) => panel.id === id);

/**
 * Handle a button or select on a settings panel: check permissions, apply the change, ask for a value with a popup if needed,
 * and show the updated panel.
 */
export async function handleSettingsInteraction(interaction: ButtonInteraction | AnySelectMenuInteraction) {
  if (!interaction.inCachedGuild()) return;

  const id = parseSettingsCustomId(interaction.customId);
  const panel = id && getSettingsPanel(id.panelId);
  if (!id || !panel) return;

  // Checked again here, as permissions may have changed since the panel was opened
  if (!interaction.memberPermissions.has(panel.permissions)) {
    return sendError(interaction, t('system.button.permissions', { permissions: panel.permissions.map((perm) => t(`permission.${perm}`)).join(', ') }));
  }

  const input: SettingsInput = interaction.isAnySelectMenu() ? { type: 'select', values: interaction.values } : { type: 'button' };
  const result = await panel.handle(interaction.guild, id, input);

  if (result.error) return sendError(interaction, result.error);
  // A popup has to be the first answer, so it's shown before anything is saved
  if (result.modal) return handleModal(interaction, panel, result.page, result.modal);

  if (result.outdated) {
    await interaction.update(await panel.render(interaction.guild, result.page));
    await interaction.followUp({ ...createResponse(t('settings.outdated'), 'warning'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    return;
  }

  // Saving can wait behind other changes, like counting catching up, so defer to not run out of time to answer
  await interaction.deferUpdate();
  await result.save?.();
  await interaction.editReply(await panel.render(interaction.guild, result.page));
}

/** Show a popup asking for a value, save what's submitted, and update the panel. */
async function handleModal(
  interaction: (ButtonInteraction | AnySelectMenuInteraction) & { guild: NonNullable<ButtonInteraction['guild']> },
  panel: SettingsPanel,
  page: string,
  modal: SettingsModal,
) {
  // Unique per interaction, so submitting an older popup can't be mistaken for this one
  const modalId = `settings-modal:${interaction.id}`;
  const textInput = new TextInputBuilder().setCustomId(MODAL_INPUT_ID).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20);
  if (modal.placeholder) textInput.setPlaceholder(modal.placeholder);
  if (modal.value) textInput.setValue(modal.value);

  await interaction.showModal(
    new ModalBuilder().setCustomId(modalId).setTitle(modal.title).addLabelComponents(new LabelBuilder().setLabel(modal.label).setTextInputComponent(textInput)),
  );

  const submit = await interaction
    .awaitModalSubmit({ time: MODAL_TIME, filter: (i) => i.customId === modalId && i.user.id === interaction.user.id })
    .catch(() => null);
  // Closing the popup isn't sent to the bot, so there's nothing to answer if it times out
  if (!submit?.isFromMessage()) return;

  const result = modal.submit(submit.fields.getTextInputValue(MODAL_INPUT_ID));
  if ('error' in result) return sendError(submit, result.error);

  await submit.deferUpdate();
  await result.save();
  await submit.editReply(await panel.render(interaction.guild, page));
}
