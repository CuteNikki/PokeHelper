import { Collection, Colors, ContainerBuilder, Events, MessageFlags, PermissionsBitField, TextDisplayBuilder, time, TimestampStyles } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { logger } from 'utility/logger';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isButton()) return; // Check if the interaction is a button

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

    if (!button) {
      return;
    }

    /**
     * Author only check: If the button is marked as author only, we need to check if the user who clicked the button is the same as the user who triggered the original interaction
     */
    if (button.options.isAuthorOnly) {
      if (
        (interaction.message.interactionMetadata && interaction.message.interactionMetadata.user.id !== interaction.user.id) ||
        (interaction.message.reference && interaction.user.id !== (await interaction.message.fetchReference())?.author.id)
      ) {
        return interaction.reply({ content: t('system.button.authorOnly'), flags: [MessageFlags.Ephemeral] });
      }
    }

    /**
     * Permissions check: If the button has permissions defined, we need to check if the user has the required permissions to interact with the button
     */
    if (button.options.permissions && interaction.member) {
      const memberPermissions = interaction.member.permissions as PermissionsBitField;

      if (!memberPermissions.has(button.options.permissions)) {
        return interaction.reply({
          content: t('system.button.permissions', { permissions: button.options.permissions.map((perm) => t(`permission.${perm}`)).join(', ') }),
          flags: [MessageFlags.Ephemeral],
        });
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

          return interaction.reply({
            // Using a relative time format for the cooldown message, will show like "in 5 seconds"
            components: [
              new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  t('system.cooldown.message', {
                    remaining: time(expirationTimestamp, TimestampStyles.RelativeTime),
                  }),
                ),
              ),
            ],
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
          });
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

      if (interaction.replied || interaction.deferred) {
        // If the interaction has already been replied to or deferred, follow up with an error message
        await interaction.followUp({
          components: [
            new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('system.button.error'))),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        });
      } else {
        // If the interaction has not been replied to, reply with an error message
        await interaction.reply({
          components: [
            new ContainerBuilder().setAccentColor(Colors.Red).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('system.button.error'))),
          ],
          flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
        });
      }
    }
  },
});
