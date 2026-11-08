import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

import { buildConfirmation } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendResponse } from 'utility/response';
import { settingsContext, type SettingsPanel } from 'utility/settings';

/** The features with a config command that has a settings panel and can be reset. */
type ConfigFeature = 'birthday' | 'counting' | 'leveling' | 'logs' | 'starboard';

/** The settings subcommand of a config command: the feature's settings panel, which only whoever used it sees. */
export async function showSettingsPanel(interaction: ChatInputCommandInteraction<'cached'>, panel: Pick<SettingsPanel, 'render'>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  // Loading the panel can create the configuration, so defer in case that takes a moment
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  return sendResponse(interaction, await panel.render(settingsContext(interaction), t));
}

/** The reset subcommand of a config command: asks whether to reset the feature. */
export async function askToReset(interaction: ChatInputCommandInteraction<'cached'>, feature: ConfigFeature, exists: () => Promise<boolean>): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  if (!(await exists())) return interaction.editReply(createResponse(t(`${feature}.resetConfiguration.nothing`), 'info'));
  return interaction.editReply(
    buildConfirmation(`${feature}-reset`, {
      question: t(`${feature}.resetConfiguration.confirm`),
      confirm: t(`${feature}.resetConfiguration.confirmButton`),
      cancel: t(`${feature}.resetConfiguration.cancelButton`),
    }),
  );
}
