import { Button } from 'classes/base/button';

import { handleSettingsInteraction } from 'settings/index';

import { SETTINGS_CUSTOM_ID_PREFIX } from 'utility/settings';

export default new Button({
  customId: SETTINGS_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  cooldown: 1,
  async execute(interaction) {
    await handleSettingsInteraction(interaction);
  },
});
