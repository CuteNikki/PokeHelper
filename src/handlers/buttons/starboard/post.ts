import { Button } from 'classes/base/button';

import { handleStarboardButton } from 'utility/starboardButtons';
import { STARBOARD_BUTTON_PREFIX } from 'utility/starboard';

/** The star and Starred by buttons on a starboard post, which anyone who sees it can use. */
export default new Button({
  customId: STARBOARD_BUTTON_PREFIX,
  includesCustomId: true,
  execute: (interaction) => handleStarboardButton(interaction),
});
