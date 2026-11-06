import { channelMention, ContainerBuilder, MessageFlags, SeparatorBuilder, TextDisplayBuilder } from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import { getGuildStickies } from 'database/sticky';

import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';
import { buildSwitchSection } from 'utility/settings';
import { shorten } from 'utility/text';
import { ThemeColors } from 'utility/theme';

/** The custom ID of the switch that turns all of a server's sticky messages on or off. */
export const STICKY_TOGGLE_ID = 'sticky-toggle';
/** How much of a sticky message the list shows. */
const PREVIEW_LENGTH = 100;

/** The start of a sticky message, for the list: its first line, without it being a heading, which would be bigger than the channel. */
const preview = (text: string) =>
  shorten(
    text
      .trim()
      .split('\n')[0]!
      .replace(/^(?:#{1,3}|-#)\s+/, ''),
    PREVIEW_LENGTH,
  );

/** A server's sticky messages, below the switch for all of them at once. */
export async function renderStickyList(guildId: string, t: Translate): Promise<ResponsePayload> {
  const [stickies, { stickiesEnabled }] = await Promise.all([getGuildStickies(guildId), getFeatureSwitches(guildId)]);
  const entries = stickies.map((sticky) => t('sticky.list.entry', { channel: channelMention(sticky.channelId), preview: preview(sticky.text) }));

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('sticky.list.title')))
    .addSectionComponents(buildSwitchSection(t('sticky.list.enabled.label'), t('sticky.list.enabled.description'), stickiesEnabled, STICKY_TOGGLE_ID, t))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(entries.length > 0 ? entries.join('\n') : t('sticky.list.none')));
  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
