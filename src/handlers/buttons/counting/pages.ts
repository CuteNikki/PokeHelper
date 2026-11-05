import { Button } from 'classes/base/button';

import { getCounterPosition } from 'database/countingStats';

import {
  buildCountingLeaderboard,
  buildCountingRuns,
  COUNTING_PAGE_MODAL_PREFIX,
  COUNTING_PAGE_PREFIX,
  COUNTING_PAGE_SIZE,
  parseCountingPageId,
} from 'utility/counting/pages';
import { getTranslate } from 'utility/i18next';
import { buildPageModal, pageOfPosition } from 'utility/pagination';
import { sendError } from 'utility/response';

/** The page buttons of /counting leaderboard and runs, for whoever used the command. Each carries its page, so they work however old the message is. */
export default new Button({
  customId: COUNTING_PAGE_PREFIX,
  includesCustomId: true,
  isAuthorOnly: true,
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const parsed = parseCountingPageId(interaction.customId);
    if (!parsed) return sendError(interaction, t('system.outdated'));

    // Asks which page in a popup, which has to be the first answer
    if (parsed.action === 'goto') return interaction.showModal(buildPageModal(`${COUNTING_PAGE_MODAL_PREFIX}${parsed.list}`, parsed.page + 1, t));

    let page = parsed.page;
    if (parsed.action === 'me') {
      const position = await getCounterPosition(interaction.guildId, interaction.user.id);
      if (position === null) return sendError(interaction, t('pagination.notListed'));
      page = pageOfPosition(position, COUNTING_PAGE_SIZE) - 1;
    }

    await interaction.deferUpdate();
    const build = parsed.list === 'leaderboard' ? buildCountingLeaderboard : buildCountingRuns;
    await interaction.editReply(await build(interaction.guildId, page, t));
  },
});
