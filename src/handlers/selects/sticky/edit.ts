import { SelectMenu } from 'classes/base/select';

import { getSticky } from 'database/sticky';

import { getTranslate } from 'utility/i18next';
import { sendError } from 'utility/response';
import { STICKY_EDIT_ID } from 'utility/stickyList';
import { buildStickyModal, stickyChannelProblem } from 'utility/stickyModal';

/** Picking a sticky message in /sticky list opens its popup, to change it without going to its channel. */
export default new SelectMenu({
  customId: STICKY_EDIT_ID,
  permissions: ['ManageMessages'],
  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    if (!interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
    const channelId = interaction.values[0] ?? '';

    // The list may be from before it was removed
    const sticky = await getSticky(channelId);
    if (sticky?.guildId !== interaction.guildId) return sendError(interaction, t('sticky.list.gone'));
    const channel = interaction.guild.channels.cache.get(channelId);
    const problem = channel ? stickyChannelProblem(interaction.guild, channelId, channel.isThread(), t) : null;
    if (problem) return sendError(interaction, problem);

    return interaction.showModal(buildStickyModal(channelId, sticky.text, t));
  },
});
