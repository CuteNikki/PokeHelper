import { SelectMenu } from 'classes/base/select';

import { getTempVoiceCreator } from 'database/tempVoice';

import { getTempVoiceSettings, TEMP_VOICE_CONFIG_ID } from 'settings/tempVoice';

import { getTranslate } from 'utility/i18next';
import { createResponse } from 'utility/response';
import { settingsContext } from 'utility/settings';

/** Opens the settings of the join channel picked from the list. */
export default new SelectMenu({
  customId: TEMP_VOICE_CONFIG_ID.open,
  permissions: ['ManageChannels'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);

    const creator = await getTempVoiceCreator(interaction.values[0] ?? '');
    if (creator?.guildId !== interaction.guildId) return interaction.update(createResponse(t('tempVoice.config.notFound'), 'error'));
    return interaction.update(await getTempVoiceSettings(creator.id).render(settingsContext(interaction), t));
  },
});
