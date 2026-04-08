import { Events } from 'discord.js';
import { t } from 'i18next';

import { Event } from 'classes/base/event';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isAutocomplete()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command || !command.options.autocomplete) return;

    try {
      await command.options.autocomplete(interaction);
    } catch (error) {
      console.error(t('system.autocomplete.error', { command: interaction.commandName }), error);
    }
  },
});
