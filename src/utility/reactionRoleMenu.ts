import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, roleMention, TextDisplayBuilder } from 'discord.js';

import type { Translate } from 'utility/i18next';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** Discord allows at most 5 buttons in a row. */
const BUTTONS_PER_ROW = 5;

/**
 * Build the message members pick their roles from: the roles with their emoji, and a button for each.
 * It's posted in a channel for everyone, so use the server's language.
 * @param roles The roles of the menu, with the emoji of their buttons.
 */
export function buildRoleMenuMessage(roles: { emoji: string; roleId: string }[], t: Translate): ResponsePayload {
  const list = roles.map((role) => t('reactionRole.message.item', { emoji: role.emoji, role: roleMention(role.roleId) })).join('\n');
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('reactionRole.message.title')}\n${t('reactionRole.message.description')}\n\n${list}`));

  for (let i = 0; i < roles.length; i += BUTTONS_PER_ROW) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        roles
          .slice(i, i + BUTTONS_PER_ROW)
          .map((role) => new ButtonBuilder().setCustomId(`rr_sel_${role.roleId}`).setEmoji(role.emoji).setStyle(ButtonStyle.Secondary)),
      ),
    );
  }

  // Listing the roles mustn't ping everyone who has them
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}
