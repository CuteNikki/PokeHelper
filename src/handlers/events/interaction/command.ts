import { Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { ensureGuild } from 'database/guild';
import { ensureUser } from 'database/user';

import { isDeveloper } from 'utility/developers';
import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { takeCooldown, waitMessage } from 'utility/rateLimit';
import { sendError } from 'utility/response';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isCommand()) return; // Check if the interaction is a command
    // Replies are in the user's language, while logs stay in English for developers
    const translate = getTranslate(interaction.locale);

    const command = client.commands.get(interaction.commandName); // Retrieve the command from the client's commands collection

    // If the command is not found, log a warning and tell the user, it's likely still registered after being removed
    if (!command) {
      logger.warn(t('system.command.notFound', { command: interaction.commandName }));
      return sendError(interaction, translate('system.command.outdated'));
    }

    // Developer commands are only registered in the developer server, but check anyway in case they end up elsewhere
    if (command.options.devOnly) {
      const allowed = await isDeveloper(interaction.client, interaction.user.id).catch((error: unknown) => {
        logger.error(error, t('system.command.developerCheckFailed'));
        return false;
      });
      if (!allowed) return sendError(interaction, translate('system.command.devOnly'));
    }

    if (command.options.cooldown) {
      const freeAt = takeCooldown(command.options.data.name, interaction.user.id, command.options.cooldown);
      if (freeAt !== null) return sendError(interaction, waitMessage(freeAt, translate));
    }

    // Trying to execute the command
    try {
      // Ensure the user and guild are in the database, inside the try so a database outage gets an error reply too
      await ensureUser(interaction.user.id);
      if (interaction.inGuild()) {
        await ensureGuild(interaction.guildId);
      }

      await command.options.execute(interaction);

      // A command that didn't respond would leave the user with "The application did not respond".
      // Most often it's a subcommand Discord still shows but the code no longer has, until the commands are registered again
      if (!interaction.replied && !interaction.deferred) {
        const subcommand = interaction.isChatInputCommand() ? interaction.options.getSubcommand(false) : null;
        const name = subcommand ? `${interaction.commandName} ${subcommand}` : interaction.commandName;
        logger.warn(t('system.command.noResponse', { command: name }));
        await sendError(interaction, translate('system.command.outdated'));
      }
    } catch (error) {
      logger.error(error, t('system.command.error', { command: interaction.commandName }));
      // Picks reply, editReply or followUp depending on how far the command got, and never throws itself
      await sendError(interaction, translate('system.command.error', { command: interaction.commandName }));
    }
  },
});
