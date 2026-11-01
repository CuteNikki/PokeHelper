import { ActionRowBuilder, Colors, ContainerBuilder, MessageFlags, StringSelectMenuBuilder, TextDisplayBuilder, type Client } from 'discord.js';

import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';

/** The select where members pick the servers their birthday is announced in. */
export const ANNOUNCE_IN_GUILDS_SELECT_ID = 'birthday-announce-in-guilds-select';
/** The option for announcing in no server. */
export const NO_GUILDS = 'none';
/** Discord shows at most 25 options, and one of them is for no servers. */
const MAX_GUILDS = 24;

/**
 * The select for picking the servers a member's birthday is announced in, out of the servers they share with the bot.
 * @param selected The servers picked so far.
 * @param saved Whether a change was just saved, which says so in place of the explanation.
 */
export function buildAnnounceInGuildsPicker(client: Client, userId: string, selected: string[], t: Translate, saved = false): ResponsePayload {
  const guilds = client.guilds.cache
    .filter((guild) => guild.members.cache.has(userId))
    .first(MAX_GUILDS)
    .map((guild) => ({ label: guild.name.slice(0, 100), value: guild.id, default: selected.includes(guild.id) }));

  // Picking no servers is its own option, as a select can't be left empty once something was picked
  const options = [
    {
      label: t('birthday.announceInGuild.noneLabel'),
      value: NO_GUILDS,
      default: selected.length === 0,
      description: t('birthday.announceInGuild.noneDescription'),
    },
    ...guilds,
  ];

  return {
    components: [
      new ContainerBuilder()
        .setAccentColor(saved ? Colors.Green : Colors.Yellow)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(t(saved ? 'birthday.announceInGuild.success' : 'birthday.announceInGuild.selectDescription')),
        )
        .addActionRowComponents(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(ANNOUNCE_IN_GUILDS_SELECT_ID)
              .setPlaceholder(t('birthday.announceInGuild.selectPlaceholder'))
              .setOptions(options)
              // Several servers can be picked, not just one
              .setMaxValues(options.length),
          ),
        ),
    ],
    flags: [MessageFlags.IsComponentsV2],
  };
}

/** The servers picked in the select, where picking no servers wins over any others picked with it. */
export const pickedGuilds = (values: string[]) => (values.includes(NO_GUILDS) ? [] : values);
