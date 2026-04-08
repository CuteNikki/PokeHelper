import { ApplicationCommandType, Client, Collection } from 'discord.js';

import type { Button } from 'classes/base/button';
import type { Command } from 'classes/base/command';

/**
 * ExtendedClient is a custom Discord.js client that includes additional functionality.
 * It extends the base Client class and adds a collection for commands.
 */
export class ExtendedClient extends Client {
  /**
   * A collection of commands that the client can execute.
   * Collection<commandName, Command<ApplicationCommandType>>
   */
  commands = new Collection<string, Command<ApplicationCommandType>>();

  /**
   * A collection of buttons that the client can handle.
   * Collection<customId, Button>
   */
  buttons = new Collection<string, Button>();

  /**
   * This collection is used to keep track of cooldowns.
   * Collection<customId/commandName, Collection<userId, timestamp>>
   */
  cooldowns = new Collection<string, Collection<string, number>>();
}
