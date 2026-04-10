import { Colors, ContainerBuilder, Events, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

import { getCounting, incrementCountingCount, resetCountingCount } from 'database/counting';

import { logger } from 'utility/logger';

export default new Event({
  name: Events.MessageCreate,
  once: false,
  async execute(_, message) {
    // Ignore bot messages and non-guild messages
    if (message.author.bot || !message.inGuild()) return;

    const counting = await getCounting(message.guildId);
    // Check if counting is set up and in the correct channel
    if (!counting || message.channelId !== counting.channelId) return;

    // Check if the author is the same as the last user who counted
    if (counting.lastNumberByUserId === message.author.id) {
      const warnMessage = await message
        .reply({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Red)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('counting.noConsecutive', { user: message.author.tag }))),
          ],
          flags: [MessageFlags.IsComponentsV2],
        })
        .catch(logger.error);
      // Delete the warning after 3 seconds
      setTimeout(() => {
        message.delete().catch(logger.error);
        warnMessage?.delete().catch(logger.error);
      }, 3000);
      return;
    }

    // Check if the message content is a valid number
    const count = parseInt(message.content, 10);

    if (isNaN(count) || count !== counting.lastNumber + 1) {
      // If the count is invalid, reset the counting configuration if resetOnFail is true
      if (counting.resetOnFail) {
        await resetCountingCount(message.guildId);
        await message.reply({
          components: [
            new ContainerBuilder()
              .setAccentColor(Colors.Red)
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('counting.reset', { number: counting.lastNumber }))),
          ],
          flags: [MessageFlags.IsComponentsV2],
        });
      } else {
        const warnMessage = await message
          .reply({
            components: [
              new ContainerBuilder()
                .setAccentColor(Colors.Red)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('counting.wrongNumber', { number: counting.lastNumber }))),
            ],
            flags: [MessageFlags.IsComponentsV2],
          })
          .catch(logger.error);
        // Delete the warning after 3 seconds
        setTimeout(() => {
          message.delete().catch(logger.error);
          warnMessage?.delete().catch(logger.error);
        }, 3000);
      }
      return;
    }

    // Increment the counting number
    await incrementCountingCount(message.guildId, message.author.id, message.id);
  },
});
