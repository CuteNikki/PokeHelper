import type { AnySelectMenuInteraction, ButtonInteraction } from 'discord.js';
import { t } from 'i18next';

import { countingSettings } from 'settings/counting';

import { sendError } from 'utility/response';
import { parseSettingsCustomId, type SettingsPanel } from 'utility/settings';

/** Every settings panel, so their buttons and selects can find them by ID. */
const panels: SettingsPanel[] = [countingSettings];

export const getSettingsPanel = (id: string) => panels.find((panel) => panel.id === id);

/**
 * Handle a button or select on a settings panel: check permissions, apply the change and show the updated panel.
 * @param apply Applies the change to the setting the component belongs to.
 */
export async function handleSettingsInteraction<I extends ButtonInteraction | AnySelectMenuInteraction>(
  interaction: I,
  apply: (panel: SettingsPanel, guildId: string, key: string) => Promise<void>,
) {
  if (!interaction.inCachedGuild()) return;

  const parsed = parseSettingsCustomId(interaction.customId);
  const panel = parsed && getSettingsPanel(parsed.panelId);
  if (!parsed || !panel) return;

  // Checked again here, as permissions may have changed since the panel was opened
  if (!interaction.memberPermissions.has(panel.permissions)) {
    return sendError(interaction, t('system.button.permissions', { permissions: panel.permissions.map((perm) => t(`permission.${perm}`)).join(', ') }));
  }

  await interaction.deferUpdate();
  await apply(panel, interaction.guildId, parsed.key);
  await interaction.editReply(await panel.render(interaction.guildId));
}
