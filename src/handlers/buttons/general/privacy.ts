import { Button } from 'classes/base/button';

import { handlePrivacyButton, PRIVACY_CUSTOM_ID_PREFIX } from 'utility/privacy';

/** The download and delete buttons of /privacy. The panel is only seen by whoever opened it, so anyone pressing is them. */
export default new Button({
  customId: PRIVACY_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  // Downloads read a lot, so not too often
  cooldown: 10,
  execute: handlePrivacyButton,
});
