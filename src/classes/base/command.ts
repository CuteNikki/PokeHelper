import type {
  ApplicationCommandType,
  AutocompleteInteraction,
  BaseInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  UserContextMenuCommandInteraction,
} from 'discord.js';

/**
 * Resolves the appropriate interaction type basecommandsd on the provided application command type.
 */
type ResolveInteraction<T extends ApplicationCommandType> = T extends ApplicationCommandType.ChatInput
  ? ChatInputCommandInteraction
  : T extends ApplicationCommandType.Message
    ? MessageContextMenuCommandInteraction
    : T extends ApplicationCommandType.User
      ? UserContextMenuCommandInteraction
      : BaseInteraction;

/**
 * Represents a command with specified options.
 *
 * @template T - The type of the application command, which can be one of the following:
 *  - `ApplicationCommandType.ChatInput` for slash commands.
 *  - `ApplicationCommandType.Message` for message context menu commands.
 *  - `ApplicationCommandType.User` for user context menu commands.
 */
export class Command<T extends ApplicationCommandType = ApplicationCommandType.ChatInput> {
  /**
   * Creates an instance of the command with the specified options.
   *
   * @param options.cooldown - The cooldown period for the command in seconds. Defaults to 3 seconds.
   * @param options.data - The data for the command, which can be a slash command builder, context menu command builder, or their variants.
   * @param options.autocomplete - The function to execute when the command is in autocomplete mode. This is optional.
   * @param options.execute - The function to execute when the command is called. This is required.
   */
  constructor(
    public options: {
      /** The cooldown period for the command in seconds. Defaults to 3 seconds. */
      cooldown?: number;
      /** Whether only the bot's developers can use the command. It's then only registered in the developer server set by DEV_GUILD_ID. */
      devOnly?: boolean;
      /** The data for the command. */
      data: T extends ApplicationCommandType.ChatInput
        ? | SlashCommandBuilder
          | SlashCommandOptionsOnlyBuilder
          | SlashCommandSubcommandBuilder
          | SlashCommandSubcommandGroupBuilder
          | SlashCommandSubcommandsOnlyBuilder
        : ContextMenuCommandBuilder;
      /** The function to execute when the command is in autocomplete mode. This is optional. */
      autocomplete?: (interaction: AutocompleteInteraction) => unknown;
      /** The function to execute when the command is called. This is required. */
      execute: (interaction: ResolveInteraction<T>) => unknown;
    },
  ) {
    this.options.cooldown ??= 3; // Default cooldown to 3 seconds if not provided
  }
}
