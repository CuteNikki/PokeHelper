import { SelectMenu } from 'classes/base/select';

import { CASES_PREFIX, handleCasesSelect } from 'utility/moderation/cases';

/** The selects of a case history, to sort it and to pick a case. */
export default new SelectMenu({
  customId: CASES_PREFIX,
  includesCustomId: true,
  permissions: ['ModerateMembers'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleCasesSelect(interaction);
  },
});
