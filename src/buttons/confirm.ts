import { Button } from 'classes/base/button';

import { CONFIRM_CUSTOM_ID_PREFIX, parseConfirmation } from 'utility/confirm';
import { confirmations } from 'utility/confirmations';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendError } from 'utility/response';

/** The confirm and cancel buttons of confirmations. The action is in the custom ID, so they never stop working. */
export default new Button({
  customId: CONFIRM_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  cooldown: 1,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const parsed = parseConfirmation(interaction.customId);
    const confirmation = parsed && confirmations[parsed.action];
    if (!parsed || !confirmation) return sendError(interaction, t('system.outdated'));

    // Checked again here, as permissions may have changed since the question was asked
    if (!interaction.memberPermissions.has(confirmation.permissions)) {
      return sendError(
        interaction,
        t('system.button.permissions', { permissions: confirmation.permissions.map((permission) => t(`permission.${permission}`)).join(', ') }),
      );
    }

    if (!parsed.confirmed) return interaction.update(createResponse(confirmation.cancelled(t), 'info'));

    await interaction.deferUpdate();
    return interaction.editReply(await confirmation.run(interaction.guild, t));
  },
});
