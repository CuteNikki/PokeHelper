import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  type Guild,
  heading,
  HeadingLevel,
  type Message,
  MessageFlags,
  type PermissionsString,
  roleMention,
  subtext,
  TextDisplayBuilder,
} from 'discord.js';

import { getFeatureSwitches } from 'database/features';
import {
  deleteRoleMenu as deleteRoleMenuFromDatabase,
  getRoleMenu,
  removeRoleFromMenus,
  replaceRoleMenuEmoji,
  updateRoleMenu,
  type RoleMenu,
} from 'database/roleMenu';

import { isMessageGone } from 'utility/discord';
import { DiscordLimits } from 'utility/discordLimits';
import { customEmojiId } from 'utility/emoji';
import { guildTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { KeyedQueue } from 'utility/queue';
import type { ResponsePayload } from 'utility/response';
import { ThemeColors } from 'utility/theme';

/** The most role menus a server can have. */
export const MAX_ROLE_MENUS = 20;
/** The most roles in a menu, 4 rows of buttons. */
export const MAX_MENU_ROLES = 20;
/** What the bot needs in the channel a menu is posted in. */
export const ROLE_MENU_CHANNEL_PERMISSIONS: PermissionsString[] = ['ViewChannel', 'SendMessages'];
/** Custom IDs of the buttons members pick their roles with, followed by the role ID. Kept from the first role menus, so their buttons keep working. */
export const ROLE_BUTTON_PREFIX = 'rr_sel_';

/** Changes to a menu's message run one after another per menu, so two quick changes can't post it twice. */
const queue = new KeyedQueue();

/**
 * Build the message members pick their roles from: the title and description, the roles with their emoji, and a button for each.
 * It's posted in a channel for everyone, so use the server's language.
 */
export function buildRoleMenuMessage(menu: RoleMenu, t: Translate): ResponsePayload {
  const lines = [heading(menu.title ?? t('roleMenu.message.title'), HeadingLevel.Three), menu.description ?? t('roleMenu.message.description'), ''];
  // Mentions always show the role's current name, so the list never goes out of date
  lines.push(...menu.roles.map((role) => t('roleMenu.message.item', { emoji: role.emoji, role: roleMention(role.roleId) })));
  if (!menu.enabled) lines.push('', subtext(t('roleMenu.message.disabled')));

  const container = new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  for (let i = 0; i < menu.roles.length; i += DiscordLimits.buttonsPerRow) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        menu.roles
          .slice(i, i + DiscordLimits.buttonsPerRow)
          .map((role) =>
            new ButtonBuilder()
              .setCustomId(`${ROLE_BUTTON_PREFIX}${role.roleId}`)
              .setEmoji(role.emoji)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(!menu.enabled),
          ),
      ),
    );
  }

  // Listing the roles mustn't ping everyone who has them
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } };
}

/** The posted message of a menu, or null if it was deleted. Other problems, like Discord being down, are thrown, so a working menu isn't posted twice. */
async function fetchMenuMessage(guild: Guild, channelId: string, messageId: string): Promise<Message | null> {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return null;
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    if (isMessageGone(error)) return null;
    throw error;
  }
}

/** Delete the posted message of a menu, if there is one. A message that's already gone, or can't be deleted, is left as it is. */
async function deleteMenuMessage(guild: Guild, channelId: string, messageId: string | null) {
  if (!messageId) return;
  const message = await fetchMenuMessage(guild, channelId, messageId).catch(() => null);
  await message?.delete().catch((error: unknown) => logger.warn(error, `Failed to delete the role menu message ${messageId}`));
}

/**
 * Make the posted message of a menu match its settings: edit it, post it again if it was deleted, or take it down when the menu has no roles.
 * Problems are logged rather than thrown, as the menu's settings are saved either way, and its panel says when it isn't posted.
 * @param force Post a new message even if the old one is still there, which moves the menu to the bottom of its channel.
 */
export async function syncRoleMenuMessage(guild: Guild, menuId: string, force = false) {
  return queue.run(menuId, () => syncNow(guild, menuId, force));
}

async function syncNow(guild: Guild, menuId: string, force: boolean) {
  try {
    const menu = await getRoleMenu(menuId);
    if (!menu || menu.guildId !== guild.id) return;

    if (menu.roles.length === 0 || force) {
      await deleteMenuMessage(guild, menu.channelId, menu.messageId);
      if (menu.messageId) await updateRoleMenu(menu.id, { messageId: null });
      if (menu.roles.length === 0) return;
    }

    // Role menus turned off for the server show as turned off, like a single menu that is
    const { roleMenusEnabled } = await getFeatureSwitches(guild.id);
    const payload = buildRoleMenuMessage({ ...menu, enabled: menu.enabled && roleMenusEnabled }, guildTranslate(guild));
    const message = menu.messageId && !force ? await fetchMenuMessage(guild, menu.channelId, menu.messageId) : null;
    if (message) {
      await message.edit(payload);
      return;
    }

    const channel = guild.channels.cache.get(menu.channelId);
    if (!channel?.isTextBased()) return;
    const sent = await channel.send(payload);
    await updateRoleMenu(menu.id, { messageId: sent.id });
  } catch (error) {
    logger.error(error, `Failed to update the role menu ${menuId} in guild ${guild.id}`);
  }
}

/** Move a menu to another channel: its message there is posted by {@link syncRoleMenuMessage}, and the old one is deleted. */
export async function moveRoleMenu(guild: Guild, menuId: string, channelId: string) {
  return queue.run(menuId, async () => {
    const menu = await getRoleMenu(menuId);
    if (!menu || menu.guildId !== guild.id || menu.channelId === channelId) return;
    await deleteMenuMessage(guild, menu.channelId, menu.messageId);
    await updateRoleMenu(menuId, { channelId, messageId: null });
  });
}

/** Delete a menu along with its posted message. */
export async function deleteRoleMenu(guild: Guild, menu: RoleMenu) {
  return queue.run(menu.id, async () => {
    await deleteMenuMessage(guild, menu.channelId, menu.messageId);
    await deleteRoleMenuFromDatabase(menu.id);
  });
}

/** What roles get instead of an emoji that's deleted, until it's changed. */
const REPLACED_EMOJI = '🏷️';

/** Give the roles with a deleted emoji another one, and update their menus' messages, which Discord wouldn't take with it anymore. */
export async function handleDeletedEmoji(guild: Guild, emojiId: string) {
  const menuIds = await replaceRoleMenuEmoji(guild.id, (emoji) => customEmojiId(emoji) === emojiId, REPLACED_EMOJI);
  for (const menuId of menuIds) await syncRoleMenuMessage(guild, menuId);
}

/** Take a deleted role out of a guild's menus, and update their messages so its button is gone. */
export async function handleDeletedRole(guild: Guild, roleId: string) {
  const menuIds = await removeRoleFromMenus(guild.id, roleId);
  for (const menuId of menuIds) await syncRoleMenuMessage(guild, menuId);
}
