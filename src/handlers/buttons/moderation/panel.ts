import { Button } from 'classes/base/button';

import { handleModerationPanelButton, MOD_PANEL_PREFIX } from 'utility/moderation/panel';

/** The buttons of the moderation panel. Only who opened it sees it, but they still need to be a moderator, in case that changed meanwhile. */
export default new Button({
  customId: MOD_PANEL_PREFIX,
  includesCustomId: true,
  permissions: ['ModerateMembers'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleModerationPanelButton(interaction);
  },
});
