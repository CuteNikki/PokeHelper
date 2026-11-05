import { Button } from 'classes/base/button';

import { buildCountingLeaderboard, buildCountingRuns, COUNTING_PAGE_PREFIX, parseCountingPageId } from 'utility/counting/pages';
import { getTranslate } from 'utility/i18next';
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

    await interaction.deferUpdate();
    const build = parsed.list === 'leaderboard' ? buildCountingLeaderboard : buildCountingRuns;
    await interaction.editReply(await build(interaction.guildId, parsed.page, t));
  },
});
