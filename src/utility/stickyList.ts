import {
  ActionRowBuilder,
  channelMention,
  ContainerBuilder,
  type Guild,
  messageLink,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import { getGuildStickies, MAX_STICKIES } from 'database/sticky';

import { DiscordLimits } from 'utility/discordLimits';
import { formatNumber } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';
import { buildSwitchSection } from 'utility/settings';
import { shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The custom ID of the switch that turns all of a server's sticky messages on or off. */
export const STICKY_TOGGLE_ID = 'sticky-toggle';
/** The custom ID of the select that opens a sticky message's popup, to change it, with its channel's ID as the value. */
export const STICKY_EDIT_ID = 'sticky-edit';
/** How much of a sticky message the list shows. */
const PREVIEW_LENGTH = 100;

/** The start of a sticky message, for the list: its first line, without it being a heading, which would be bigger than the channel. */
const preview = (text: string, length = PREVIEW_LENGTH) =>
  shorten(
    text
      .trim()
      .split('\n')[0]!
      .replace(/^(?:#{1,3}|-#)\s+/, ''),
    length,
  );

/** A server's sticky messages, below the switch for all of them at once, with a select to change one. */
export async function renderStickyList(guild: Guild, t: Translate): Promise<ResponsePayload> {
  const [stickies, { stickiesEnabled }] = await Promise.all([getGuildStickies(guild.id), getFeatureSwitches(guild.id)]);

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('sticky.list.title')))
    // Large, so the title, the switch and the list stand apart, like in the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addSectionComponents(buildSwitchSection(t('sticky.list.enabled.label'), t('sticky.list.enabled.description'), stickiesEnabled, STICKY_TOGGLE_ID, t))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));

  if (stickies.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(t('sticky.list.none')));
    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
  }

  const entries = stickies.map((sticky) => {
    const channel = channelMention(sticky.channelId);
    // Only while it's posted, which it isn't while they're turned off
    const line = sticky.messageId
      ? t('sticky.list.entryPosted', { channel, link: messageLink(sticky.channelId, sticky.messageId, guild.id) })
      : t('sticky.list.entry', { channel });
    return `${line}\n${subtext(preview(sticky.text))}`;
  });
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [subtext(t('sticky.list.count', { count: stickies.length, max: formatNumber(MAX_STICKIES, t) })), ...entries].join('\n'),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(STICKY_EDIT_ID)
          .setPlaceholder(t('sticky.list.placeholder'))
          .addOptions(
            stickies.map((sticky) =>
              new StringSelectMenuOptionBuilder()
                // A select can't show a channel mention, so it's the channel's name
                .setLabel(`#${guild.channels.cache.get(sticky.channelId)?.name ?? sticky.channelId}`.slice(0, DiscordLimits.optionLabelLength))
                .setDescription(preview(sticky.text, DiscordLimits.optionLabelLength))
                .setValue(sticky.channelId),
            ),
          ),
      ),
    );
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
