import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { handleSettingsModal } from 'settings/index';

import { getTranslate } from 'utility/i18next';
import { handleLeaderboardPageModal } from 'utility/leveling/leaderboardPageModal';
import { LEADERBOARD_PAGE_MODAL_PREFIX } from 'utility/leveling/leaderboardView';
import { logger } from 'utility/logger';
import { handlePokedexSearchModal, POKEDEX_SEARCH_MODAL_PREFIX } from 'utility/pokedex/entry';
import { sendError } from 'utility/response';
import { SETTINGS_CUSTOM_ID_PREFIX } from 'utility/settings';

/**
 * Popups are handled by their custom ID, like buttons, instead of being waited for where they were shown,
 * so they work however long they were open, even across restarts.
 */
export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(_client, interaction) {
    if (!interaction.isModalSubmit()) return;

    try {
      if (interaction.customId.startsWith(SETTINGS_CUSTOM_ID_PREFIX)) await handleSettingsModal(interaction);
      else if (interaction.customId.startsWith(LEADERBOARD_PAGE_MODAL_PREFIX)) await handleLeaderboardPageModal(interaction);
      else if (interaction.customId.startsWith(POKEDEX_SEARCH_MODAL_PREFIX)) await handlePokedexSearchModal(interaction);
      else await sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    } catch (error) {
      logger.error(error, `Failed to handle the popup ${interaction.customId}`);
      await sendError(interaction, getTranslate(interaction.locale)('system.button.error'));
    }
  },
});
