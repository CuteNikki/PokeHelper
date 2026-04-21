import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ContainerBuilder,
  Guild,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  userMention,
  type InteractionEditReplyOptions,
} from 'discord.js';
import { t } from 'i18next';

import { getLevelFromXP, getTopUsersByXP, getTotalUsersWithXP } from 'database/leveling';

const ITEMS_PER_PAGE = 10;

export async function buildLeaderboard({
  page,
  guild,
  sortOrder = 'desc',
}: {
  page: number;
  guild: Guild;
  sortOrder?: 'asc' | 'desc';
}): Promise<InteractionEditReplyOptions> {
  const userCount = await getTotalUsersWithXP(guild.id);
  const totalPages = Math.ceil(userCount / ITEMS_PER_PAGE);

  const pageData = await getTopUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder);

  const container = new ContainerBuilder()
    .setAccentColor(Colors.Gold)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t('leveling.leaderboard.title', { guild: guild.name })));

  pageData.forEach((entry, index) => {
    const position = (page - 1) * ITEMS_PER_PAGE + index + 1;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('leveling.leaderboard.entry', {
          user: userMention(entry.userId),
          level: getLevelFromXP(entry.xp),
          xp: entry.xp,
          position,
        }),
      ),
    );
  });

  const rowPageButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lb_first_${sortOrder}`)
      // .setLabel(t('pagination.first.label'))
      .setEmoji(t('pagination.first.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`lb_prev_${sortOrder}_${page}`)
      // .setLabel(t('pagination.previous.label'))
      .setEmoji(t('pagination.previous.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`lb_custom_${sortOrder}_${page}_${totalPages}`)
      .setLabel(t('pagination.page.label', { current: page, total: totalPages }))
      // .setEmoji(t('pagination.page.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId(`lb_next_${sortOrder}_${page}`)
      // .setLabel(t('pagination.next.label'))
      .setEmoji(t('pagination.next.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
    new ButtonBuilder()
      .setCustomId(`lb_last_${sortOrder}_${totalPages}`)
      // .setLabel(t('pagination.last.label'))
      .setEmoji(t('pagination.last.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
  );
  const rowSortOrder = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`lb_sort_${page}`).addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(t('pagination.sort.ascending'))
        .setValue('asc')
        .setEmoji('⬆️')
        .setDefault(sortOrder === 'asc'),
      new StringSelectMenuOptionBuilder()
        .setLabel(t('pagination.sort.descending'))
        .setValue('desc')
        .setEmoji('⬇️')
        .setDefault(sortOrder === 'desc'),
    ),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large));
  container.addActionRowComponents(rowPageButtons);
  container.addActionRowComponents(rowSortOrder);

  return {
    allowedMentions: { users: [] },
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}
