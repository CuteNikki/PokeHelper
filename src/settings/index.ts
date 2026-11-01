import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { getTranslate, type Translate } from 'utility/i18next';

import { birthdaySettings } from 'settings/birthday';
import { countingSettings } from 'settings/counting';
import { levelingSettings } from 'settings/leveling';
import { getRoleMenuSettings, ROLE_MENU_PANEL_PREFIX } from 'settings/roleMenu';

import { createResponse, sendError } from 'utility/response';
import { parseSettingsCustomId, type SettingsInput, type SettingsModal, type SettingsPanel } from 'utility/settings';

/** Every settings panel, so their buttons and selects can find them by ID. Role menus each have their own, found by their ID. */
const panels: SettingsPanel[] = [countingSettings, levelingSettings, birthdaySettings];

const MODAL_INPUT_ID = 'value';
/** The most characters typed into a popup, unless it says otherwise. */
const DEFAULT_INPUT_LENGTH = 20;

export const getSettingsPanel = (id: string) =>
  id.startsWith(ROLE_MENU_PANEL_PREFIX) ? getRoleMenuSettings(id.slice(ROLE_MENU_PANEL_PREFIX.length)) : panels.find((panel) => panel.id === id);

/** Whether someone may change the settings of a panel. Checked on every use, as permissions may have changed since the panel was opened. */
async function checkPermissions(
  interaction: ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>,
  panel: SettingsPanel,
  t: Translate,
) {
  if (interaction.memberPermissions.has(panel.permissions)) return true;
  await sendError(interaction, t('system.button.permissions', { permissions: panel.permissions.map((perm) => t(`permission.${perm}`)).join(', ') }));
  return false;
}

/** Save a change, run the panel's follow-up work, like updating a posted role menu, and show the updated panel. */
async function saveAndRender(
  interaction: ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>,
  panel: SettingsPanel,
  page: string,
  save: (() => Promise<unknown>) | undefined,
  t: Translate,
) {
  // Saving can wait behind other changes, like counting catching up, so defer to not run out of time to answer
  await interaction.deferUpdate();
  if (save) {
    await save();
    await panel.onSaved?.(interaction.guild);
  }
  await interaction.editReply(await panel.render(interaction.guild, t, page));
}

/**
 * Handle a button or select on a settings panel: check permissions, apply the change, ask for a value with a popup if needed,
 * and show the updated panel.
 */
export async function handleSettingsInteraction(interaction: ButtonInteraction | AnySelectMenuInteraction) {
  if (!interaction.inCachedGuild()) return;
  // Settings panels are only seen by the person using them, so they're in their language
  const t = getTranslate(interaction.locale);

  const id = parseSettingsCustomId(interaction.customId);
  const panel = id && getSettingsPanel(id.panelId);
  if (!id || !panel) return;
  if (!(await checkPermissions(interaction, panel, t))) return;

  const input: SettingsInput = interaction.isAnySelectMenu() ? { type: 'select', values: interaction.values } : { type: 'button' };
  const result = await panel.handle(interaction.guild, id, input, t);

  if (result.error) return sendError(interaction, result.error);
  // A popup has to be the first answer, so it's shown before anything is saved
  if (result.modal) return interaction.showModal(buildModal(result.modal));

  if (result.outdated) {
    await interaction.update(await panel.render(interaction.guild, t, result.page));
    await interaction.followUp({ ...createResponse(t('settings.outdated'), 'warning'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    return;
  }

  await saveAndRender(interaction, panel, result.page, result.save, t);
}

/**
 * Handle a submitted settings popup. The popup's custom ID says what it's for, so it's handled the same however long it was open,
 * even across restarts.
 */
export async function handleSettingsModal(interaction: ModalSubmitInteraction) {
  if (!interaction.inCachedGuild() || !interaction.isFromMessage()) return;
  const t = getTranslate(interaction.locale);

  const id = parseSettingsCustomId(interaction.customId);
  const panel = id && getSettingsPanel(id.panelId);
  if (!id || !panel) return;
  if (!(await checkPermissions(interaction, panel, t))) return;

  const result = await panel.submitModal(interaction.guild, id, interaction.fields.getTextInputValue(MODAL_INPUT_ID), t);
  if (result.error) return sendError(interaction, result.error);
  await saveAndRender(interaction, panel, result.page, result.save, t);
}

function buildModal(modal: SettingsModal) {
  const textInput = new TextInputBuilder()
    .setCustomId(MODAL_INPUT_ID)
    .setStyle(modal.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(!modal.optional)
    .setMaxLength(modal.maxLength ?? DEFAULT_INPUT_LENGTH);
  if (modal.placeholder) textInput.setPlaceholder(modal.placeholder);
  if (modal.value) textInput.setValue(modal.value);

  return new ModalBuilder()
    .setCustomId(modal.customId)
    .setTitle(modal.title)
    .addLabelComponents(new LabelBuilder().setLabel(modal.label).setTextInputComponent(textInput));
}
