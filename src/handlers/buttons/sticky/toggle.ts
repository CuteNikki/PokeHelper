import { Button } from 'classes/base/button';

import { getFeatureSwitches } from 'database/features';

import { getTranslate } from 'utility/i18next';
import { setStickiesEnabled } from 'utility/sticky';
import { renderStickyList, STICKY_TOGGLE_ID } from 'utility/stickyList';

/** The switch above the list of sticky messages, which turns all of them on or off at once. */
export default new Button({
  customId: STICKY_TOGGLE_ID,
  permissions: ['ManageMessages'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    // Taking down or posting every sticky message can take a moment
    await interaction.deferUpdate();
    const { stickiesEnabled } = await getFeatureSwitches(interaction.guildId);
    await setStickiesEnabled(interaction.client, interaction.guildId, !stickiesEnabled);
    return interaction.editReply(await renderStickyList(interaction.guildId, getTranslate(interaction.locale)));
  },
});
