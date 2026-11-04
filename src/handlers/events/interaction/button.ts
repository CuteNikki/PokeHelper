import { Collection, Events, PermissionsBitField, time, TimestampStyles } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { sendError } from 'utility/response';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isButton()) return; // Check if the interaction is a button
    // Replies are in the user's language, while logs stay in English for developers
    const translate = getTranslate(interaction.locale);

    let button = client.buttons.get(interaction.customId); // Retrieve the button from the client's buttons collection

    /**
     * Custom ID matching: If the button is not found by exact custom ID, we can check if any button has a custom ID that is included in the interaction's custom ID
     */
    if (!button) {
      for (const [, btn] of client.buttons) {
        if (!interaction.customId.includes(btn.options.customId) || !btn.options.includesCustomId) {
          continue;
        }
        button = btn;
        break;
      }
    }

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

    /**
     * Cooldown check: If the button has a cooldown defined, we need to check if the user is currently on cooldown for this button
     */
    if (button.options.cooldown && button.options.cooldown > 0) {
      const cooldowns = client.cooldowns;

      if (!cooldowns.has(button.options.customId)) {
        cooldowns.set(button.options.customId, new Collection());
      }

      const now = Date.now();
      const timestamps = cooldowns.get(button.options.customId)!; // Forcing the type because we just created the collection above
      const cooldownAmount = button.options.cooldown * 1_000; // Convert cooldown from seconds to milliseconds
      const userId = interaction.user.id;

      if (timestamps.has(userId)) {
        const expirationTime = timestamps.get(userId)! + cooldownAmount; // Forcing the type because we know the userId exists in the collection

        if (now < expirationTime) {
          const expirationTimestamp = Math.round(expirationTime / 1_000); // Convert to seconds for discords timestamp format

          // Using a relative time format for the cooldown message, will show like "in 5 seconds"
          return sendError(interaction, translate('system.cooldown.message', { remaining: time(expirationTimestamp, TimestampStyles.RelativeTime) }));
        }
      }

      // Set the timestamp for the user
      timestamps.set(userId, now);
      // Remove the userId from the cooldowns after the cooldown period
      setTimeout(() => timestamps.delete(userId), cooldownAmount);
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
