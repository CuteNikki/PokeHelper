import { Collection, Events, PermissionsBitField, time, TimestampStyles } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';
import { sendError } from 'utility/response';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isAnySelectMenu()) return; // Check if the interaction is a select menu

    let selectMenu = client.selectMenus.get(interaction.customId); // Retrieve the select menu from the client's selectMenus collection

    /**
     * Custom ID matching: If the select menu is not found by exact custom ID, we can check if any select menu has a custom ID that is included in the interaction's custom ID
     */
    if (!selectMenu) {
      for (const [, menu] of client.selectMenus) {
        if (!interaction.customId.includes(menu.options.customId) || !menu.options.includesCustomId) {
          continue;
        }
        selectMenu = menu;
        break;
      }
    }

    if (!selectMenu) {
      return;
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
        return sendError(interaction, t('system.selectMenu.authorOnly'));
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
          t('system.selectMenu.permissions', { permissions: selectMenu.options.permissions.map((perm) => t(`permission.${perm}`)).join(', ') }),
        );
      }
    }

    /**
     * Cooldown check: If the select menu has a cooldown defined, we need to check if the user is currently on cooldown for this select menu
     */
    if (selectMenu.options.cooldown && selectMenu.options.cooldown > 0) {
      const cooldowns = client.cooldowns;

      if (!cooldowns.has(selectMenu.options.customId)) {
        cooldowns.set(selectMenu.options.customId, new Collection());
      }

      const now = Date.now();
      const timestamps = cooldowns.get(selectMenu.options.customId)!; // Forcing the type because we just created the collection above
      const cooldownAmount = selectMenu.options.cooldown * 1_000; // Convert cooldown from seconds to milliseconds
      const userId = interaction.user.id;

      if (timestamps.has(userId)) {
        const expirationTime = timestamps.get(userId)! + cooldownAmount; // Forcing the type because we know the userId exists in the collection

        if (now < expirationTime) {
          const expirationTimestamp = Math.round(expirationTime / 1_000); // Convert to seconds for discords timestamp format

          // Using a relative time format for the cooldown message, will show like "in 5 seconds"
          return sendError(interaction, t('system.cooldown.message', { remaining: time(expirationTimestamp, TimestampStyles.RelativeTime) }));
        }
      }

      // Set the timestamp for the user
      timestamps.set(userId, now);
      // Remove the userId from the cooldowns after the cooldown period
      setTimeout(() => timestamps.delete(userId), cooldownAmount);
    }

    /**
     * Trying to execute the select menu's execute function and catch any errors that occur during execution
     */
    try {
      await selectMenu.options.execute(interaction);
    } catch (error) {
      logger.error(error, t('system.selectMenu.error'));
      // Picks reply, editReply or followUp depending on how far the select menu got, and never throws itself
      await sendError(interaction, t('system.selectMenu.error'));
    }
  },
});
