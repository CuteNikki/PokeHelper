import { SelectMenu } from 'classes/base/select';

import { handleTempVoiceSelect } from 'utility/tempVoice/controls';
import { TEMP_VOICE_CUSTOM_ID_PREFIX } from 'utility/tempVoice/panel';

/** The selects of a temporary voice channel's panel: who's let in, who's kept out, and someone who's here. */
export default new SelectMenu({
  customId: TEMP_VOICE_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  // Picking people is quick, several in a row, and changes to a channel wait their turn anyway
  cooldown: 0,
  execute: (interaction) => handleTempVoiceSelect(interaction),
});
