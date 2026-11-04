import { SelectMenu } from 'classes/base/select';

import { buildHelp, HELP_CATEGORY_SELECT_ID, HELP_OVERVIEW } from 'utility/help';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { sendError } from 'utility/response';

/** Shows another category of /help, or the list of them. Only who used /help sees it, so anyone pressing it is them. */
export default new SelectMenu({
  customId: HELP_CATEGORY_SELECT_ID,
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    await interaction.deferUpdate();
    try {
      await interaction.editReply(await buildHelp(interaction, interaction.values[0] ?? HELP_OVERVIEW, t));
    } catch (error) {
      logger.error(error, 'Failed to fetch the registered commands for /help');
      await sendError(interaction, t('help.unavailable'));
    }
  },
});
