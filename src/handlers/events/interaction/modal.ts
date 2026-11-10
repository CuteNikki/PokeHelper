import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { handleSettingsModal } from 'settings/index';

import { COUNTING_PAGE_MODAL_PREFIX, handleCountingPageModal } from 'utility/counting/pages';
import { FRIEND_CODES_COPY_MODAL_ID } from 'utility/friendCodeView';
import { handleParticipantsModal, PARTICIPANTS_PREFIX } from 'utility/giveaways/participants';
import { getTranslate } from 'utility/i18next';
import { handleLeaderboardPageModal } from 'utility/leveling/leaderboardPageModal';
import { LEADERBOARD_PAGE_MODAL_PREFIX } from 'utility/leveling/leaderboardView';
import { logger } from 'utility/logger';
import { COPY_IDS_MODAL_ID } from 'utility/logs/copyIds';
import { closeCopyModal } from 'utility/modal';
import { CASES_PREFIX, handleCasesModal } from 'utility/moderation/cases';
import { handleModerationPanelModal, MOD_PANEL_PREFIX } from 'utility/moderation/panel';
import { handlePokedexSearchModal, POKEDEX_SEARCH_MODAL_PREFIX } from 'utility/pokedex/entry';
import { GUESS_MODAL_PREFIX, handleGuessModal } from 'utility/pokedex/guess';
import { sendError } from 'utility/response';
import { SETTINGS_CUSTOM_ID_PREFIX } from 'utility/settings';
import { handleServerInfoModal, SERVER_INFO_PAGE_MODAL_PREFIX } from 'utility/serverInfo';
import { STICKY_MODAL_PREFIX } from 'utility/sticky';
import { handleStickyModal } from 'utility/stickyModal';
import { handleTempVoiceModal } from 'utility/tempVoice/controls';
import { TEMP_VOICE_EDIT_MODAL_PREFIX } from 'utility/tempVoice/panel';

/** Popups are handled by their custom ID, like buttons, so they work however long they were open, even across restarts. */
export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(_client, interaction) {
    if (!interaction.isModalSubmit()) return;

    try {
      if (interaction.customId.startsWith(SETTINGS_CUSTOM_ID_PREFIX)) await handleSettingsModal(interaction);
      else if (interaction.customId.startsWith(LEADERBOARD_PAGE_MODAL_PREFIX)) await handleLeaderboardPageModal(interaction);
      else if (interaction.customId.startsWith(COUNTING_PAGE_MODAL_PREFIX)) await handleCountingPageModal(interaction);
      else if (interaction.customId.startsWith(POKEDEX_SEARCH_MODAL_PREFIX)) await handlePokedexSearchModal(interaction);
      else if (interaction.customId.startsWith(GUESS_MODAL_PREFIX)) await handleGuessModal(interaction);
      else if (interaction.customId.startsWith(TEMP_VOICE_EDIT_MODAL_PREFIX)) await handleTempVoiceModal(interaction);
      else if (interaction.customId.startsWith(STICKY_MODAL_PREFIX)) await handleStickyModal(interaction);
      else if (interaction.customId.startsWith(CASES_PREFIX)) await handleCasesModal(interaction);
      else if (interaction.customId.startsWith(SERVER_INFO_PAGE_MODAL_PREFIX)) await handleServerInfoModal(interaction);
      else if (interaction.customId.startsWith(PARTICIPANTS_PREFIX)) {
        if (interaction.inCachedGuild()) await handleParticipantsModal(interaction);
      } else if (interaction.customId.startsWith(MOD_PANEL_PREFIX)) {
        if (interaction.inCachedGuild()) await handleModerationPanelModal(interaction);
      } else if (interaction.customId === COPY_IDS_MODAL_ID || interaction.customId === FRIEND_CODES_COPY_MODAL_ID) await closeCopyModal(interaction);
      else await sendError(interaction, getTranslate(interaction.locale)('system.outdated'));
    } catch (error) {
      logger.error(error, `Failed to handle the popup ${interaction.customId}`);
      await sendError(interaction, getTranslate(interaction.locale)('system.modal.error'));
    }
  },
});
