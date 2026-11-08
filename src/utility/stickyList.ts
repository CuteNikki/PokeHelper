import {
  ActionRowBuilder,
  channelMention,
  ContainerBuilder,
  type Guild,
  messageLink,
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
import { formatNumber, SECOND } from 'utility/duration';
import type { Translate } from 'utility/i18next';
import { messageOf, type ResponsePayload } from 'utility/response';
import { buildSwitchSection } from 'utility/settings';
import { MAX_DELAY, QUIET_DELAY } from 'utility/sticky';
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

  // How they work, like the tips of the settings panels, with the waits they really use
  const tipsText = (): string => {
    const tips: string[] = t('sticky.list.tips', { returnObjects: true, quiet: formatNumber(QUIET_DELAY / SECOND, t), max: formatNumber(MAX_DELAY / SECOND, t) });
    return [t('settings.tips'), ...tips.map((tip) => subtext(`• ${tip}`))].join('\n');
  };

  if (stickies.length === 0) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('sticky.list.none')))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(tipsText()));
    return messageOf(container);
  }

  const entries = stickies.map((sticky, index) => {
    const channel = channelMention(sticky.channelId);
    const position = index + 1;
    // Only while it's posted, which it isn't while they're turned off
    const line = sticky.messageId
      ? t('sticky.list.entryPosted', { position, channel, link: messageLink(sticky.channelId, sticky.messageId, guild.id) })
      : t('sticky.list.entry', { position, channel });
    // Small, under its channel, with a dot like the tips have. Not as an item of a list, where Discord shows small text as is
    return `${line}\n${subtext(`• ${preview(sticky.text)}`)}`;
  });
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [subtext(t('sticky.list.count', { count: stickies.length, max: formatNumber(MAX_STICKIES, t) })), ...entries].join('\n'),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(tipsText()))
    // Large, like before the buttons at the bottom of the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(STICKY_EDIT_ID)
          .setPlaceholder(t('sticky.list.placeholder'))
          .addOptions(
            stickies.map((sticky, index) =>
              new StringSelectMenuOptionBuilder()
                // A select can't show a channel mention, so it's the channel's name, with its number in the list
                .setLabel(`${index + 1}. #${guild.channels.cache.get(sticky.channelId)?.name ?? sticky.channelId}`.slice(0, DiscordLimits.optionLabelLength))
                .setDescription(preview(sticky.text, DiscordLimits.optionLabelLength))
                .setValue(sticky.channelId),
            ),
          ),
      ),
    );
  return messageOf(container);
}
