import { Button } from 'classes/base/button';

import { COPY_IDS_PREFIX, showCopyIds } from 'utility/logs/copyIds';

/** The Copy IDs button of log entries, which anyone who can see the log can use. */
export default new Button({
  customId: COPY_IDS_PREFIX,
  includesCustomId: true,
  cooldown: 1,
  execute: (interaction) => showCopyIds(interaction),
});
