import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  chatInputApplicationCommandMention,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SeparatorBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  type ApplicationCommand,
  type ApplicationCommandOption,
  type ChatInputCommandInteraction,
  type Collection,
  type LocalizationMap,
} from 'discord.js';

import type { ExtendedClient } from 'classes/base/client';
import { Command } from 'classes/base/command';

import { getTranslate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { sendError, sendResponse } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The order of the categories, by the folder their commands are in. Others come after them. */
const CATEGORY_ORDER = ['pokemon', 'leveling', 'birthday', 'counting', 'role-menu', 'general'];
/** The commands that need a permission are listed apart from the others, under this. */
const SETTINGS_CATEGORY = 'settings';

let registered: Collection<string, ApplicationCommand> | null = null;

/**
 * The commands as registered with Discord, for their IDs, which mentions need, and their translations.
 * Asked for again when a loaded command isn't there, like after registering a new one.
 */
async function getRegisteredCommands(interaction: ChatInputCommandInteraction): Promise<Collection<string, ApplicationCommand>> {
  const loaded = (interaction.client as ExtendedClient).commands.filter((command) => !command.options.devOnly).map((command) => command.options.data.name);
  const known = registered;
  if (known && loaded.every((name) => known.some((command) => command.name === name))) return known;
  registered = await interaction.client.application.commands.fetch({ withLocalizations: true });
  return registered;
}

/** A description in the user's language, or English. */
const describe = (item: { description: string; descriptionLocalizations?: LocalizationMap | null }, locale: string) =>
  item.descriptionLocalizations?.[locale as keyof LocalizationMap] ?? item.description;

/** A line per subcommand, or one for the command if it has none, each a mention that runs it when clicked. */
function commandLines(command: ApplicationCommand, locale: string): string[] {
  const line = (mention: string, item: { description: string; descriptionLocalizations?: LocalizationMap | null }) => `${mention} ${describe(item, locale)}`;
  const subcommands = (options: readonly ApplicationCommandOption[]) =>
    options.filter((option) => option.type === ApplicationCommandOptionType.Subcommand || option.type === ApplicationCommandOptionType.SubcommandGroup);

  const top = subcommands(command.options);
  if (top.length === 0) return [line(chatInputApplicationCommandMention(command.name, command.id), command)];

  return top.flatMap((option) => {
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      return (option.options ?? []).map((sub) => line(chatInputApplicationCommandMention(command.name, option.name, sub.name, command.id), sub));
    }
    return [line(chatInputApplicationCommandMention(command.name, option.name, command.id), option)];
  });
}

/** Whether the command can be used where /help was: in this kind of channel, with how the bot is installed, and with the user's permissions. */
function isUsableHere(command: ApplicationCommand, interaction: ChatInputCommandInteraction): boolean {
  if (interaction.context !== null && command.contexts && !command.contexts.includes(interaction.context)) return false;
  // Where only the user installed the bot, the commands of the server install aren't there
  const installedInServer = interaction.authorizingIntegrationOwners[ApplicationIntegrationType.GuildInstall] !== undefined;
  if (!installedInServer && !command.integrationTypes?.includes(ApplicationIntegrationType.UserInstall)) return false;
  if (command.defaultMemberPermissions && !interaction.memberPermissions?.has(command.defaultMemberPermissions)) return false;
  return true;
}

export default new Command({
  data: new SlashCommandBuilder()
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setName('help')
    .setDescription('All the commands you can use here'),

  async execute(interaction) {
    const t = getTranslate(interaction.locale);
    const client = interaction.client as ExtendedClient;

    const commands = await getRegisteredCommands(interaction).catch((error: unknown) => {
      logger.error(error, 'Failed to fetch the registered commands for /help');
      return null;
    });
    if (!commands) return sendError(interaction, t('help.unavailable'));

    // Grouped by the folder each command is in, with those that need a permission apart
    const categories = new Map<string, string[]>();
    for (const command of [...commands.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const loaded = client.commands.get(command.name);
      if (!loaded || loaded.options.devOnly || !isUsableHere(command, interaction)) continue;
      const category = command.defaultMemberPermissions ? SETTINGS_CATEGORY : loaded.category;
      categories.set(category, [...(categories.get(category) ?? []), ...commandLines(command, interaction.locale)]);
    }

    const position = (category: string) => {
      if (category === SETTINGS_CATEGORY) return CATEGORY_ORDER.length + 1;
      const index = CATEGORY_ORDER.indexOf(category);
      return index === -1 ? CATEGORY_ORDER.length : index;
    };
    const labels = t('help.categories', { returnObjects: true }) as Record<string, string>;

    const container = new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(t('help.title')));
    for (const [category, lines] of [...categories].sort(([a], [b]) => position(a) - position(b))) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${labels[category] ?? category}\n${lines.join('\n')}`));
    }

    return sendResponse(interaction, { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } }, { ephemeral: true });
  },
});
