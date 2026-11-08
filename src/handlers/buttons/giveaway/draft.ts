import { channelMention } from 'discord.js';

import { Button } from 'classes/base/button';

import { deleteGiveaway, getGiveaway } from 'database/giveaways';

import { GIVEAWAY_DRAFT_CUSTOM_ID } from 'settings/giveaway';

import { getTranslate } from 'utility/i18next';
import { publishDraft } from 'utility/giveaways/publish';
import { createResponse, sendError } from 'utility/response';

/** The buttons under a draft: starting it, which posts it, and throwing it away. The draft's ID is in their custom ID. */
export default new Button({
  customId: 'gwdraft:',
  includesCustomId: true,
  permissions: ['ManageGuild'],
  async execute(interaction) {
    if (!interaction.inCachedGuild()) return;
    const t = getTranslate(interaction.locale);
    const { customId } = interaction;

    // Answered before anything is looked up, which can take a moment
    await interaction.deferUpdate();

    if (customId.startsWith(GIVEAWAY_DRAFT_CUSTOM_ID.start)) {
      const result = await publishDraft(interaction.guild, customId.slice(GIVEAWAY_DRAFT_CUSTOM_ID.start.length), t);
      // An error leaves the draft as it is, to fix what's wrong and try again
      if ('error' in result) return sendError(interaction, result.error);
      return interaction.editReply(createResponse(t('giveaway.draft.started', { channel: channelMention(result.channelId), link: result.link }), 'success'));
    }

    if (customId.startsWith(GIVEAWAY_DRAFT_CUSTOM_ID.discard)) {
      const id = customId.slice(GIVEAWAY_DRAFT_CUSTOM_ID.discard.length);
      // Only drafts, as a started giveaway is ended or cancelled in its own way
      const draft = await getGiveaway(interaction.guildId, id);
      if (draft?.status === 'draft') await deleteGiveaway(interaction.guildId, id);
      return interaction.editReply(createResponse(t('giveaway.draft.discarded'), 'success'));
    }

    return sendError(interaction, t('system.outdated'));
  },
});
