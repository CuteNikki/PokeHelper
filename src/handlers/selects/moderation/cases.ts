import { SelectMenu } from 'classes/base/select';

import { CASES_PREFIX, handleCasesSelect } from 'utility/moderation/cases';

/** The select of a case history that sorts it. */
export default new SelectMenu({
  customId: CASES_PREFIX,
  includesCustomId: true,
  permissions: ['ModerateMembers'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    await handleCasesSelect(interaction);
  },
});
