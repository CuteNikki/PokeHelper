import { Events } from 'discord.js';

import { Event } from 'classes/base/event';

import { handleComponent } from 'utility/components';
import { findHandler } from 'utility/customId';

export default new Event({
  name: Events.InteractionCreate,
  once: false,
  async execute(client, interaction) {
    if (!interaction.isAnySelectMenu()) return;
    await handleComponent(interaction, findHandler(client.selectMenus, interaction.customId), 'selectMenu');
  },
});
