import { SelectMenu } from 'classes/base/select';

import { deleteUserReminder, getUserReminders } from 'database/reminders';

import { getTranslate } from 'utility/i18next';
import { buildReminderList, REMINDER_DELETE_ID } from 'utility/reminders/view';

/** Deletes a reminder from /remind list, which then shows the ones left. Only who used it sees the list, so anyone picking one is them. */
export default new SelectMenu({
  customId: REMINDER_DELETE_ID,
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    // It may have gone off or been deleted meanwhile, which is fine, the list is shown as it is now either way
    await deleteUserReminder(interaction.user.id, interaction.values[0] ?? '');
    await interaction.update(buildReminderList(await getUserReminders(interaction.user.id), t));
  },
});
