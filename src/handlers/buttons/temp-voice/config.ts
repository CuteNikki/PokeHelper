import { Button } from 'classes/base/button';

import { getFeatureSwitches, setFeatureSwitch } from 'database/features';
import { deleteTempVoiceCreator, getTempVoiceCreator } from 'database/tempVoice';

import { creatorName, getTempVoiceSettings, renderTempVoiceList, TEMP_VOICE_CONFIG_ID } from 'settings/tempVoice';

import { buildQuestion } from 'utility/confirm';
import { getTranslate } from 'utility/i18next';
import { createResponse, sendError, withNotice } from 'utility/response';
import { settingsContext } from 'utility/settings';

/** The buttons that act on one join channel, followed by its ID. */
const ACTIONS = [TEMP_VOICE_CONFIG_ID.delete, TEMP_VOICE_CONFIG_ID.confirmDelete, TEMP_VOICE_CONFIG_ID.back];

/**
 * The buttons around the join channel settings: back to the list, and deleting one.
 * Everything they need is in their custom ID, so they never stop working, also the confirmation for deleting.
 */
export default new Button({
  customId: 'voicecfg:',
  includesCustomId: true,
  permissions: ['ManageChannels'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const { customId } = interaction;

    // Answered before anything is looked up, which can take a moment, as Discord gives up after 3 seconds. None of them opens a popup
    await interaction.deferUpdate();

    if (customId === TEMP_VOICE_CONFIG_ID.list) return interaction.editReply(await renderTempVoiceList(interaction.guild, t));

    if (customId === TEMP_VOICE_CONFIG_ID.toggle) {
      const { tempVoiceEnabled } = await getFeatureSwitches(interaction.guildId);
      await setFeatureSwitch(interaction.guildId, 'tempVoiceEnabled', !tempVoiceEnabled);
      return interaction.editReply(await renderTempVoiceList(interaction.guild, t));
    }

    const action = ACTIONS.find((prefix) => customId.startsWith(prefix));
    if (!action) return sendError(interaction, t('system.outdated'));
    const creator = await getTempVoiceCreator(customId.slice(action.length));
    if (creator?.guildId !== interaction.guildId) return interaction.editReply(createResponse(t('tempVoice.config.notFound'), 'error'));

    switch (action) {
      case TEMP_VOICE_CONFIG_ID.delete:
        return interaction.editReply(
          buildQuestion(
            {
              question: t('tempVoice.config.deleteQuestion', { name: creatorName(creator, interaction.guild, t) }),
              confirm: t('tempVoice.config.deleteConfirm'),
              cancel: t('tempVoice.config.deleteCancel'),
            },
            { confirm: `${TEMP_VOICE_CONFIG_ID.confirmDelete}${creator.id}`, cancel: `${TEMP_VOICE_CONFIG_ID.back}${creator.id}` },
          ),
        );

      case TEMP_VOICE_CONFIG_ID.confirmDelete: {
        // The channel itself stays, it's only no longer a join channel. Channels made with it stay until they're empty
        await deleteTempVoiceCreator(creator.id);
        return interaction.editReply(withNotice(t('tempVoice.config.deleted'), 'success', await renderTempVoiceList(interaction.guild, t)));
      }

      case TEMP_VOICE_CONFIG_ID.back:
        return interaction.editReply(await getTempVoiceSettings(creator.id).render(settingsContext(interaction), t));
    }
  },
});
