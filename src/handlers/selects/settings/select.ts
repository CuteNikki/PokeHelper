import { SelectMenu } from 'classes/base/select';

import { handleSettingsInteraction } from 'settings/index';

import { SETTINGS_CUSTOM_ID_PREFIX } from 'utility/settings';

export default new SelectMenu({
  customId: SETTINGS_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  async execute(interaction) {
    await handleSettingsInteraction(interaction);
  },
});
