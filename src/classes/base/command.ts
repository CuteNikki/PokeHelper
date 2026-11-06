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

/** The interaction a command gets, by its type. */
type ResolveInteraction<T extends ApplicationCommandType> = T extends ApplicationCommandType.ChatInput
  ? ChatInputCommandInteraction
  : T extends ApplicationCommandType.Message
    ? MessageContextMenuCommandInteraction
    : T extends ApplicationCommandType.User
      ? UserContextMenuCommandInteraction
      : BaseInteraction;

/** A slash command, or a context menu command on a message or user. */
export class Command<T extends ApplicationCommandType = ApplicationCommandType.ChatInput> {
  /** The folder the command is in, like `leveling`, which /help groups the commands by. Set when it's loaded. */
  category = '';

  constructor(
    public options: {
      /** Seconds between uses for each person, 3 if not given. */
      cooldown?: number;
      /** Whether only the bot's developers can use the command. It's then only registered in the developer server set by DEV_GUILD_ID. */
      devOnly?: boolean;
      data: T extends ApplicationCommandType.ChatInput
        ? | SlashCommandBuilder
          | SlashCommandOptionsOnlyBuilder
          | SlashCommandSubcommandBuilder
          | SlashCommandSubcommandGroupBuilder
          | SlashCommandSubcommandsOnlyBuilder
        : ContextMenuCommandBuilder;
      autocomplete?: (interaction: AutocompleteInteraction) => unknown;
      execute: (interaction: ResolveInteraction<T>) => unknown;
    },
  ) {
    this.options.cooldown ??= 3;
  }
}
