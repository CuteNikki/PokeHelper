import { Button } from 'classes/base/button';

import { GUESS_CUSTOM_ID_PREFIX, handleGuessButton } from 'utility/pokedex/guess';

/** The buttons of a guessing game. Only whoever started it can play, the game is all in the buttons, so they work however old it is. */
export default new Button({
  customId: GUESS_CUSTOM_ID_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  execute: handleGuessButton,
});
