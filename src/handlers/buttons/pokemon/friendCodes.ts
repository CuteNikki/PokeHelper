import { Button } from 'classes/base/button';

import { FRIEND_CODES_PREFIX, handleFriendCodesButton } from 'utility/friendCodeView';

/** The Copy and edit buttons under someone's friend codes, which anyone who sees them can use. */
export default new Button({
  customId: FRIEND_CODES_PREFIX,
  includesCustomId: true,
  cooldown: 1,
  execute: (interaction) => handleFriendCodesButton(interaction),
});
