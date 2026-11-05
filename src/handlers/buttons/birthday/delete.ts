import { Button } from 'classes/base/button';

import { DELETE_BIRTHDAY_ID } from 'settings/myBirthday';

import { buildConfirmation } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';

/** Asks whether to delete your birthday, from its panel. The answer is handled by the confirmation buttons. */
export default new Button({
  customId: DELETE_BIRTHDAY_ID,
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    await interaction.update(
      buildConfirmation('birthday-delete', {
        question: t('birthday.panel.deleteConfirm.question'),
        confirm: t('birthday.panel.deleteConfirm.confirm'),
        cancel: t('birthday.panel.deleteConfirm.cancel'),
      }),
    );
  },
});
