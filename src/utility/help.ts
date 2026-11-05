import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  chatInputApplicationCommandMention,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ApplicationCommand,
  type ApplicationCommandOption,
  type Collection,
  type Interaction,
  type LocalizationMap,
} from 'discord.js';

import type { ExtendedClient } from 'classes/base/client';

import { getCounting } from 'database/counting';
import { getFeatureSwitches } from 'database/features';
import { getGuildLevelingConfiguration } from 'database/leveling';

import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The custom ID of the select that picks a category of /help, with the category as its value. */
export const HELP_CATEGORY_SELECT_ID = 'help:category';
/** The select's value that goes back to the list of categories. */
export const HELP_OVERVIEW = 'overview';

/** The order of the categories, by the folder their commands are in. Others come after them. */
const CATEGORY_ORDER = ['pokemon', 'leveling', 'birthday', 'counting', 'role-menu', 'temp-voice', 'starboard', 'logs', 'general'];
let registered: Collection<string, ApplicationCommand> | null = null;

/**
 * The commands as registered with Discord, for their IDs, which mentions need, and their translations.
 * Asked for again when a loaded command isn't there, like after registering a new one.
 */
async function getRegisteredCommands(interaction: Interaction): Promise<Collection<string, ApplicationCommand>> {
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
function isUsableHere(command: ApplicationCommand, interaction: Interaction): boolean {
  if (interaction.context !== null && command.contexts && !command.contexts.includes(interaction.context)) return false;
  // Where only the user installed the bot, the commands of the server install aren't there
  const installedInServer = interaction.authorizingIntegrationOwners[ApplicationIntegrationType.GuildInstall] !== undefined;
  if (!installedInServer && !command.integrationTypes?.includes(ApplicationIntegrationType.UserInstall)) return false;
  if (command.defaultMemberPermissions && !interaction.memberPermissions?.has(command.defaultMemberPermissions)) return false;
  return true;
}

/**
 * The categories whose commands for everyone are left out, as their feature is turned off in this server.
 * Their settings commands are still listed, to turn them back on.
 */
async function turnedOffCategories(guildId: string | null): Promise<Set<string>> {
  if (!guildId) return new Set();
  const [switches, leveling, counting] = await Promise.all([getFeatureSwitches(guildId), getGuildLevelingConfiguration(guildId), getCounting(guildId)]);
  const off = new Set<string>();
  if (!leveling?.enabled) off.add('leveling');
  if (counting && !counting.enabled) off.add('counting');
  if (!switches.tempVoiceEnabled) off.add('temp-voice');
  return off;
}

/** The commands usable here, as lines by category, in the order the categories are shown. */
async function getCategories(interaction: Interaction): Promise<[string, string[]][]> {
  const client = interaction.client as ExtendedClient;
  const [commands, off] = await Promise.all([getRegisteredCommands(interaction), turnedOffCategories(interaction.guildId)]);

  // Grouped by the folder each command is in, the ones for everyone first and those that need a permission, like settings, after them
  const forEveryoneFirst = (a: ApplicationCommand, b: ApplicationCommand) =>
    Number(Boolean(a.defaultMemberPermissions)) - Number(Boolean(b.defaultMemberPermissions)) || a.name.localeCompare(b.name);
  const categories = new Map<string, string[]>();
  for (const command of [...commands.values()].sort(forEveryoneFirst)) {
    const loaded = client.commands.get(command.name);
    // Commands in the menu of a name or message can't be mentioned, they're found where they're used
    if (command.type !== ApplicationCommandType.ChatInput) continue;
    if (!loaded || loaded.options.devOnly || !isUsableHere(command, interaction)) continue;
    if (off.has(loaded.category) && !command.defaultMemberPermissions) continue;
    categories.set(loaded.category, [...(categories.get(loaded.category) ?? []), ...commandLines(command, interaction.locale)]);
  }

  const position = (category: string) => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...categories].sort(([a], [b]) => position(a) - position(b));
}

/**
 * Build /help: the categories of commands usable here with what they're for, or the commands of one category,
 * with a select to pick another. One category at a time, so it stays short however many commands there are.
 * @param category The category to show, or {@link HELP_OVERVIEW} for the list of them. One that isn't usable here shows the list.
 * @throws When the registered commands can't be fetched.
 */
export async function buildHelp(interaction: Interaction, category: string, t: Translate): Promise<ResponsePayload> {
  const categories = await getCategories(interaction);
  const labels = t('help.categories', { returnObjects: true }) as Record<string, string>;
  const descriptions = t('help.descriptions', { returnObjects: true }) as Record<string, string>;
  const label = (key: string) => labels[key] ?? key;
  const shown = categories.find(([key]) => key === category);

  const container = new ContainerBuilder().setAccentColor(ThemeColors.info);
  if (shown) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('help.title')}\n### ${label(shown[0])}\n${shown[1].join('\n')}`));
  } else {
    const list = categories.map(([key]) => `**${label(key)}**${descriptions[key] ? ` · ${descriptions[key]}` : ''}`);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('help.title')}\n${t('help.intro')}\n\n${list.join('\n')}`));
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(HELP_CATEGORY_SELECT_ID)
    .setPlaceholder(t('help.select'))
    .addOptions(
      { label: t('help.overview'), value: HELP_OVERVIEW, emoji: '📖', default: !shown },
      ...categories.map(([key]) => ({ label: label(key).slice(0, 100), value: key, default: key === shown?.[0] })),
    );
  container
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));

  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}
