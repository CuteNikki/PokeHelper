import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
  ContainerBuilder,
  Guild,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  userMention,
  type InteractionEditReplyOptions,
} from 'discord.js';
import { t } from 'i18next';

import { getLevelFromXP, getTopUsersByXP, getTopWeeklyUsersByXP, getTotalUsersWithXP, getTotalWeeklyUsersWithXP } from 'database/leveling';

const ITEMS_PER_PAGE = 10;

export async function buildLeaderboard({
  page,
  guild,
  weekly = false,
  sortOrder = 'desc',
}: {
  page: number;
  guild: Guild;
  weekly: boolean;
  sortOrder?: 'asc' | 'desc';
}): Promise<InteractionEditReplyOptions> {
  const userCount = weekly ? await getTotalWeeklyUsersWithXP(guild.id) : await getTotalUsersWithXP(guild.id);
  const totalPages = Math.ceil(userCount / ITEMS_PER_PAGE);

  const pageData = weekly
    ? await getTopWeeklyUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder)
    : await getTopUsersByXP(guild.id, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE, sortOrder);

  const container = new ContainerBuilder()
    .setAccentColor(Colors.Gold)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        weekly ? t('leveling.leaderboard.titleWeekly', { guild: guild.name }) : t('leveling.leaderboard.title', { guild: guild.name }),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        pageData.length > 0
          ? pageData
              .map((entry, index) => {
                const position = (page - 1) * ITEMS_PER_PAGE + index + 1;
                return t('leveling.leaderboard.entry', {
                  user: userMention(entry.userId),
                  level: getLevelFromXP(entry.xp),
                  xp: entry.xp,
                  position,
                });
              })
              .join('\n')
          : t('leveling.leaderboard.none'),
      ),
    );

  const rowPageButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('lb_first')
      // .setLabel(t('pagination.first.label'))
      .setEmoji(t('pagination.first.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId('lb_prev')
      // .setLabel(t('pagination.previous.label'))
      .setEmoji(t('pagination.previous.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),
    new ButtonBuilder()
      .setCustomId(`lb_custom_${page}_${totalPages}`)
      .setLabel(t('pagination.page.label', { current: page, total: totalPages }))
      // .setEmoji(t('pagination.page.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false),
    new ButtonBuilder()
      .setCustomId('lb_next')
      // .setLabel(t('pagination.next.label'))
      .setEmoji(t('pagination.next.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
    new ButtonBuilder()
      .setCustomId(`lb_last_${totalPages}`)
      // .setLabel(t('pagination.last.label'))
      .setEmoji(t('pagination.last.icon'))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages),
  );
  const rowSortOrder = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`lb_sort`).addOptions(
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

  return {
    allowedMentions: { users: [] },
    components: [container, rowPageButtons, rowSortOrder],
    flags: MessageFlags.IsComponentsV2,
  };
}
