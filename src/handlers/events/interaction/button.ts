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
    if (!interaction.isButton()) return; // Check if the interaction is a button
    // Replies are in the user's language, while logs stay in English for developers
    const translate = getTranslate(interaction.locale);

    const button = findHandler(client.buttons, interaction.customId);

    // Every button and select is handled by its custom ID, so one without a handler is from an older version of the bot
    if (!button) {
      return sendError(interaction, translate('system.outdated'));
    }

    /**
     * Author only check: If the button is marked as author only, we need to check if the user who clicked the button is the same as the user who triggered the original interaction
     */
    if (button.options.isAuthorOnly) {
      if (
        (interaction.message.interactionMetadata && interaction.message.interactionMetadata.user.id !== interaction.user.id) ||
        // The referenced message may have been deleted, in which case nobody counts as the author
        (interaction.message.reference && interaction.user.id !== (await interaction.message.fetchReference().catch(() => null))?.author.id)
      ) {
        return sendError(interaction, translate('system.button.authorOnly'));
      }
    }

    /**
     * Permissions check: If the button has permissions defined, we need to check if the user has the required permissions to interact with the button
     */
    if (button.options.permissions && interaction.member) {
      const memberPermissions = interaction.member.permissions as PermissionsBitField;

      if (!memberPermissions.has(button.options.permissions)) {
        return sendError(
          interaction,
          translate('system.button.permissions', { permissions: button.options.permissions.map((perm) => translate(`permission.${perm}`)).join(', ') }),
        );
      }
    }

    if (button.options.cooldown) {
      const freeAt = takeCooldown(button.options.customId, interaction.user.id, button.options.cooldown);
      if (freeAt !== null) return sendError(interaction, waitMessage(freeAt, translate));
    }

    // Clicking a few times in a row is normal use, like paging or changing settings, so only spamming is stopped
    const freeAt = takeBurst(`${button.options.customId}:${interaction.user.id}`);
    if (freeAt !== null) {
      return sendError(interaction, waitMessage(freeAt, translate));
    }

    /**
     * Trying to execute the button's execute function and catch any errors that occur during execution
     */
    try {
      await button.options.execute(interaction);
    } catch (error) {
      logger.error(error, t('system.button.error'));
      // Picks reply, editReply or followUp depending on how far the button got, and never throws itself
      await sendError(interaction, translate('system.button.error'));
    }
  },
});
