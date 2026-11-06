import { Button } from 'classes/base/button';

import { handleTempVoiceButton } from 'utility/tempVoice/controls';
import { TEMP_VOICE_CUSTOM_ID_PREFIX } from 'utility/tempVoice/panel';

/** The buttons of a temporary voice channel's panel. Each says which channel it's for, so they work however old the panel is. */
export default new Button({
  customId: TEMP_VOICE_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  execute: (interaction) => handleTempVoiceButton(interaction),
});
