import { Button } from 'classes/base/button';

import { CONFIRM_CUSTOM_ID_PREFIX, parseConfirmation } from 'utility/confirm';
import { confirmations } from 'utility/confirmations';
import { getTranslate } from 'utility/i18next';
import { sendError } from 'utility/response';
import { settingsContext } from 'utility/settings';

/** The confirm and cancel buttons of confirmations. The action is in the custom ID, so they never stop working. */
export default new Button({
  customId: CONFIRM_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const t = getTranslate(interaction.locale);

    const parsed = parseConfirmation(interaction.customId);
    const confirmation = parsed && confirmations[parsed.action];
    if (!parsed || !confirmation) return sendError(interaction, t('system.outdated'));

    if (confirmation.scope === 'guild') {
      if (!interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
      // Checked again here, as permissions may have changed since the question was asked
      if (!interaction.memberPermissions.has(confirmation.permissions)) {
        return sendError(
          interaction,
          t('system.button.permissions', { permissions: confirmation.permissions.map((permission) => t(`permission.${permission}`)).join(', ') }),
        );
      }
    }

    const context = settingsContext(interaction);
    await interaction.deferUpdate();
    return interaction.editReply(await (parsed.confirmed ? confirmation.run(context, t) : confirmation.cancel(context, t)));
  },
});
