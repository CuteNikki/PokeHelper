import { ApplicationCommandType, Client, Collection, type ClientEvents } from 'discord.js';

import type { Button } from 'classes/base/button';
import type { Command } from 'classes/base/command';
import type { SelectMenu } from 'classes/base/select';

/** The client, with the bot's commands, buttons and selects loaded from their folders. */
export class ExtendedClient extends Client {
  /** By command name. */
  commands = new Collection<string, Command<ApplicationCommandType>>();

  /** By custom ID. */
  buttons = new Collection<string, Button>();

  /** By custom ID. */
  selectMenus = new Collection<string, SelectMenu>();

  /** Cooldowns kept by features, like when each member last earned XP. */
  cooldowns = new Collection<string, Collection<string, number>>();

  /** The listeners registered for the files in src/handlers/events, so they can be removed when the events are reloaded. */
  eventListeners: { name: keyof ClientEvents; listener: (...args: unknown[]) => void }[] = [];
}
