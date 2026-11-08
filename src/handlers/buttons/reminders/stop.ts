import { ComponentType } from 'discord.js';

import { Button } from 'classes/base/button';

import { deleteUserReminder, getReminder } from 'database/reminders';

import { getTranslate } from 'utility/i18next';
import { REMINDER_STOP_PREFIX } from 'utility/reminders/view';
import { createResponse, sendError, sendResponse } from 'utility/response';

/** Stops a repeating reminder from where it went off. In a channel others see it too, so only who set it can stop it. */
export default new Button({
  customId: REMINDER_STOP_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const id = interaction.customId.slice(REMINDER_STOP_PREFIX.length);

    // Answered first, as Discord gives up after 3 seconds
    await interaction.deferUpdate();
    const reminder = await getReminder(id);
    if (reminder && reminder.userId !== interaction.user.id) return sendError(interaction, t('reminders.stop.notYours'));

    await deleteUserReminder(interaction.user.id, id);
    // The button goes, the reminder stays readable
    await interaction.editReply({ components: interaction.message.components.filter((component) => component.type !== ComponentType.ActionRow) });
    return sendResponse(interaction, createResponse(t(reminder ? 'reminders.stop.done' : 'reminders.stop.gone'), 'success'), { ephemeral: true });
  },
});
