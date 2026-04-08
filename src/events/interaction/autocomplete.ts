import { Events } from 'discord.js';

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
      console.error(`Error handling autocomplete for command ${interaction.commandName}:`, error);
    }
  },
});
