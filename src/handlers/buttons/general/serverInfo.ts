import { Button } from 'classes/base/button';

import { handleServerInfoButton, SERVER_INFO_PREFIX } from 'utility/serverInfo';

/** The buttons of /serverinfo, which only who used it sees: its roles and emojis, their pages, and the way back. */
export default new Button({
  customId: SERVER_INFO_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleServerInfoButton(interaction);
  },
});
