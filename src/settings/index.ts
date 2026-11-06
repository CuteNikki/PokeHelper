import { MessageFlags, type AnySelectMenuInteraction, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { getTranslate, type Translate } from 'utility/i18next';
import { buildTextModal } from 'utility/modal';

import { birthdaySettings } from 'settings/birthday';
import { countingSettings } from 'settings/counting';
import { levelingSettings } from 'settings/leveling';
import { logSettings } from 'settings/logs';
import { friendCodeSettings } from 'settings/friendCodes';
import { myBirthdaySettings } from 'settings/myBirthday';
import { getRoleMenuSettings, ROLE_MENU_PANEL_PREFIX } from 'settings/roleMenu';
import { starboardSettings } from 'settings/starboard';
import { getTempVoiceSettings, TEMP_VOICE_PANEL_PREFIX } from 'settings/tempVoice';

import { createResponse, sendError } from 'utility/response';
import { parseSettingsCustomId, settingsContext, type SettingsInput, type SettingsModal, type SettingsPanel } from 'utility/settings';

/** Every settings panel, so their buttons and selects can find them by ID. Role menus and join channels each have their own, found by their ID. */
const panels: SettingsPanel[] = [countingSettings, levelingSettings, birthdaySettings, myBirthdaySettings, friendCodeSettings, logSettings, starboardSettings];

const MODAL_INPUT_ID = 'value';
/** The most characters typed into a popup, unless it says otherwise. */
const DEFAULT_INPUT_LENGTH = 20;

function getSettingsPanel(id: string) {
  if (id.startsWith(ROLE_MENU_PANEL_PREFIX)) return getRoleMenuSettings(id.slice(ROLE_MENU_PANEL_PREFIX.length));
  if (id.startsWith(TEMP_VOICE_PANEL_PREFIX)) return getTempVoiceSettings(id.slice(TEMP_VOICE_PANEL_PREFIX.length));
  return panels.find((panel) => panel.id === id);
}

type PanelInteraction = ButtonInteraction | AnySelectMenuInteraction | ModalSubmitInteraction;

/**
 * Whether someone may change the settings of a panel. Checked on every use, as permissions may have changed since the panel was opened.
 * Server settings need a server and the panel's permissions there. Personal settings are always someone's own, so anyone can use them anywhere.
 */
async function checkPermissions(interaction: PanelInteraction, panel: SettingsPanel, t: Translate) {
  if (panel.scope === 'user') return true;
  // Only a server the bot is in has settings, so a panel from anywhere else is outdated
  if (!interaction.inCachedGuild()) {
    await sendError(interaction, t('system.outdated'));
    return false;
  }
  if (interaction.memberPermissions.has(panel.permissions)) return true;
  // Said of what was used, as panels have selects and popups too
  const key = interaction.isButton() ? 'system.button.permissions' : interaction.isModalSubmit() ? 'system.modal.permissions' : 'system.selectMenu.permissions';
  await sendError(interaction, t(key, { permissions: panel.permissions.map((perm) => t(`permission.${perm}`)).join(', ') }));
  return false;
}

/** Save a change, run the panel's follow-up work, like updating a posted role menu, and show the updated panel. */
async function saveAndRender(interaction: PanelInteraction, panel: SettingsPanel, page: string, save: (() => Promise<unknown>) | undefined, t: Translate) {
  // Saving can wait behind other changes, like counting catching up, so defer to not run out of time to answer
  await interaction.deferUpdate();
  const context = settingsContext(interaction);
  if (save) {
    await save();
    await panel.onSaved?.(context);
  }
  await interaction.editReply(await panel.render(context, t, page));
}

/**
 * Handle a button or select on a settings panel: check permissions, apply the change, ask for a value with a popup if needed,
 * and show the updated panel.
 */
export async function handleSettingsInteraction(interaction: ButtonInteraction | AnySelectMenuInteraction) {
  // Settings panels are only seen by the person using them, so they're in their language
  const t = getTranslate(interaction.locale);

  const id = parseSettingsCustomId(interaction.customId);
  const panel = id && getSettingsPanel(id.panelId);
  if (!id || !panel) return sendError(interaction, t('system.outdated'));
  if (!(await checkPermissions(interaction, panel, t))) return;

  const input: SettingsInput = interaction.isAnySelectMenu() ? { type: 'select', values: interaction.values } : { type: 'button' };
  const result = await panel.handle(settingsContext(interaction), id, input, t);

  if (result.error) return sendError(interaction, result.error);
  // A popup has to be the first answer, so it's shown before anything is saved
  if (result.modal) return interaction.showModal(buildModal(result.modal));

  if (result.outdated) {
    await interaction.update(await panel.render(settingsContext(interaction), t, result.page));
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
  const t = getTranslate(interaction.locale);
  // Settings popups are always opened from a panel
  if (!interaction.isFromMessage()) return sendError(interaction, t('system.outdated'));

  const id = parseSettingsCustomId(interaction.customId);
  const panel = id && getSettingsPanel(id.panelId);
  if (!id || !panel) return sendError(interaction, t('system.outdated'));
  if (!(await checkPermissions(interaction, panel, t))) return;

  const result = await panel.submitModal(settingsContext(interaction), id, interaction.fields.getTextInputValue(MODAL_INPUT_ID), t);
  if (result.error) return sendError(interaction, result.error);
  await saveAndRender(interaction, panel, result.page, result.save, t);
}

function buildModal(modal: SettingsModal) {
  return buildTextModal({
    customId: modal.customId,
    title: modal.title,
    label: modal.label,
    inputId: MODAL_INPUT_ID,
    placeholder: modal.placeholder,
    value: modal.value,
    maxLength: modal.maxLength ?? DEFAULT_INPUT_LENGTH,
    optional: modal.optional,
    paragraph: modal.paragraph,
  });
}
