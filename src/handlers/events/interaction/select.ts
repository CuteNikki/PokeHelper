import { Events, PermissionsBitField } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { findHandler } from 'utility/customId';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { takeBurst, takeCooldown, waitMessage } from 'utility/rateLimit';
import { sendError } from 'utility/response';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isAnySelectMenu()) return; // Check if the interaction is a select menu
    // Replies are in the user's language, while logs stay in English for developers
    const translate = getTranslate(interaction.locale);

    const selectMenu = findHandler(client.selectMenus, interaction.customId);

    // Every button and select is handled by its custom ID, so one without a handler is from an older version of the bot
    if (!selectMenu) {
      return sendError(interaction, translate('system.outdated'));
    }

    /**
     * Author only check: If the select menu is marked as author only, we need to check if the user who clicked the select menu is the same as the user who triggered the original interaction
     */
    if (selectMenu.options.isAuthorOnly) {
      if (
        (interaction.message.interactionMetadata && interaction.message.interactionMetadata.user.id !== interaction.user.id) ||
        // The referenced message may have been deleted, in which case nobody counts as the author
        (interaction.message.reference && interaction.user.id !== (await interaction.message.fetchReference().catch(() => null))?.author.id)
      ) {
        return sendError(interaction, translate('system.selectMenu.authorOnly'));
      }
    }

    /**
     * Permissions check: If the select menu has permissions defined, we need to check if the user has the required permissions to interact with the select menu
     */
    if (selectMenu.options.permissions && interaction.member) {
      const memberPermissions = interaction.member.permissions as PermissionsBitField;

      if (!memberPermissions.has(selectMenu.options.permissions)) {
        return sendError(
          interaction,
          translate('system.selectMenu.permissions', { permissions: selectMenu.options.permissions.map((perm) => translate(`permission.${perm}`)).join(', ') }),
        );
      }
    }

    if (selectMenu.options.cooldown) {
      const freeAt = takeCooldown(selectMenu.options.customId, interaction.user.id, selectMenu.options.cooldown);
      if (freeAt !== null) return sendError(interaction, waitMessage(freeAt, translate));
    }

    // Clicking a few times in a row is normal use, like paging or changing settings, so only spamming is stopped
    const freeAt = takeBurst(`${selectMenu.options.customId}:${interaction.user.id}`);
    if (freeAt !== null) {
      return sendError(interaction, waitMessage(freeAt, translate));
    }

    /**
     * Trying to execute the select menu's execute function and catch any errors that occur during execution
     */
    try {
      await selectMenu.options.execute(interaction);
    } catch (error) {
      logger.error(error, t('system.selectMenu.error'));
      // Picks reply, editReply or followUp depending on how far the select menu got, and never throws itself
      await sendError(interaction, translate('system.selectMenu.error'));
    }
  },
});
