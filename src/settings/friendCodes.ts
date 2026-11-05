import { getFriendCodes, setFriendCode } from 'database/friendCodes';

import { exampleFriendCode, FRIEND_CODE_GAMES, formatFriendCode, MAX_FRIEND_CODE_INPUT, parseFriendCode, type FriendCodes } from 'utility/friendCodes';
import { createSettingsPanel, type Setting } from 'utility/settings';

/** Your own friend codes, the same in every server, and in DMs. A code is taken out by saving it empty. */
export const friendCodeSettings = createSettingsPanel<FriendCodes>({
  id: 'friend-codes',
  scope: 'user',
  title: (t) => t('friendCodes.panel.title'),
  permissions: [],
  load: async (userId) => {
    const saved = await getFriendCodes(userId);
    return Object.fromEntries(FRIEND_CODE_GAMES.map((game) => [game, saved?.[game] ?? null])) as FriendCodes;
  },
  notConfigured: (t) => t('friendCodes.panel.title'),
  header: (_codes, _context, t) => t('friendCodes.panel.intro'),
  settings: FRIEND_CODE_GAMES.map((game): Setting<FriendCodes> => ({
    type: 'text',
    key: game,
    maxLength: MAX_FRIEND_CODE_INPUT,
    label: (t) => t(`friendCodes.games.${game}`),
    description: (t) => t(`friendCodes.panel.${game}`),
    placeholder: () => exampleFriendCode(game),
    formatValue: (code) => `\`${formatFriendCode(game, code)}\``,
    validate: (text, t) => (parseFriendCode(game, text) ? null : t('friendCodes.panel.invalid', { example: exampleFriendCode(game) })),
    get: (codes) => codes[game],
    set: (userId, text) => setFriendCode(userId, game, text ? parseFriendCode(game, text) : null),
  })),
});
