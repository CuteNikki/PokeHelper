import { Button } from 'classes/base/button';

import { CASES_PREFIX, handleCasesButton } from 'utility/moderation/cases';

/** The buttons of a case history. Only who opened it sees it, but they still need to be a moderator, in case that changed meanwhile. */
export default new Button({
  customId: CASES_PREFIX,
  includesCustomId: true,
  permissions: ['ModerateMembers'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleCasesButton(interaction);
  },
});
