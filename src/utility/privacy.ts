import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Client,
  type PermissionsString,
} from 'discord.js';

import { getGuildOrCreate } from 'database/guild';
import { deleteGuildData, deleteUserData, getGivenRoles, getGuildData, getUserData, type GivenRole } from 'database/privacy';

import { runCountingTask } from 'utility/counting/game';
import { buildConfirmation } from 'utility/confirm';
import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import { forgetLogConfig } from 'utility/logs/send';
import { createResponse, sendError, type ResponsePayload } from 'utility/response';
import type { SettingsContext } from 'utility/settings';
import { ThemeColors } from 'utility/theme';

/**
 * `/privacy`: download or delete what's stored about yourself, and about a server for those who manage it.
 * Its buttons are `privacy:<download|delete>:<user|guild>`.
 */

export const PRIVACY_CUSTOM_ID_PREFIX = 'privacy:';
export const PRIVACY_POLICY_URL = 'https://github.com/CuteNikki/PokeHelper/blob/main/PRIVACY.md';
/** Who can download and delete a server's data: the same people who can change its settings. */
export const GUILD_DATA_PERMISSIONS: PermissionsString[] = ['ManageGuild'];

type Scope = 'user' | 'guild';
const privacyCustomId = (action: 'download' | 'delete', scope: Scope) => `${PRIVACY_CUSTOM_ID_PREFIX}${action}:${scope}`;

/** The panel: your own data, and the server's below it when you can manage it. */
export function buildPrivacyPanel(context: SettingsContext, t: Translate): ResponsePayload {
  const buttons = (scope: Scope) =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(privacyCustomId('download', scope)).setLabel(t('privacy.download')).setEmoji('📥').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(privacyCustomId('delete', scope)).setLabel(t('privacy.delete')).setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    );

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('privacy.title')}\n${t('privacy.intro', { url: PRIVACY_POLICY_URL })}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${t('privacy.user.title')}**\n-# ${t('privacy.user.description')}`))
    .addActionRowComponents(buttons('user'));

  if (context.guild && context.member?.permissions.has(GUILD_DATA_PERMISSIONS)) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${t('privacy.guild.title', { name: context.guild.name })}**\n-# ${t('privacy.guild.description')}`),
      )
      .addActionRowComponents(buttons('guild'));
  }

  return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

/** Data as a JSON file, readable by people and programs. */
const jsonFile = (data: unknown, name: string) => new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name });

/** The buttons of the panel. Downloads come as a file only whoever pressed sees, deleting asks first. */
export async function handlePrivacyButton(interaction: ButtonInteraction): Promise<unknown> {
  const t = getTranslate(interaction.locale);
  const [action, scope] = interaction.customId.slice(PRIVACY_CUSTOM_ID_PREFIX.length).split(':');
  if ((action !== 'download' && action !== 'delete') || (scope !== 'user' && scope !== 'guild')) return sendError(interaction, t('system.outdated'));

  // Checked when pressed, as permissions may have changed since the panel was opened
  if (scope === 'guild') {
    if (!interaction.inCachedGuild()) return sendError(interaction, t('system.outdated'));
    if (!interaction.memberPermissions.has(GUILD_DATA_PERMISSIONS)) {
      return sendError(
        interaction,
        t('system.button.permissions', { permissions: GUILD_DATA_PERMISSIONS.map((permission) => t(`permission.${permission}`)).join(', ') }),
      );
    }
  }

  if (action === 'delete') {
    await interaction.deferUpdate();
    return interaction.editReply(
      buildConfirmation(scope === 'user' ? 'privacy-delete-user' : 'privacy-delete-guild', {
        question: scope === 'user' ? t('privacy.user.confirm') : t('privacy.guild.confirm', { name: interaction.guild?.name ?? '' }),
        confirm: t('privacy.confirmButton'),
        cancel: t('privacy.cancelButton'),
      }),
    );
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const exportedAt = new Date().toISOString();
  const name = scope === 'user' ? `poke-helper-user-${interaction.user.id}.json` : `poke-helper-server-${interaction.guildId}.json`;
  const data = scope === 'user' ? await getUserData(interaction.user.id) : await getGuildData(interaction.guildId!);
  // A file on a message made of components only shows when a component points to it
  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.success)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(t(`privacy.${scope}.downloaded`)))
    .addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
  return interaction.editReply({ components: [container], files: [jsonFile({ exportedAt, ...data }, name)], flags: [MessageFlags.IsComponentsV2] });
}

/** Take away roles the bot gave, as nothing would remember to take them away once their data is deleted. Failures are only logged. */
async function takeBackRoles(client: Client, roles: GivenRole[]) {
  for (const { guildId, userId, roleId } of roles) {
    const member = await client.guilds.cache
      .get(guildId)
      ?.members.fetch(userId)
      .catch(() => null);
    if (member?.roles.cache.has(roleId)) {
      await member.roles.remove(roleId).catch((error: unknown) => logger.warn(error, `Failed to take back role ${roleId} of ${userId} in guild ${guildId}`));
    }
  }
}

/** Delete everything about whoever confirmed, in every server. */
export async function deleteOwnData(context: SettingsContext, t: Translate): Promise<ResponsePayload> {
  await takeBackRoles(context.client, await getGivenRoles({ userId: context.userId }));
  await deleteUserData(context.userId);
  return createResponse(t('privacy.user.deleted'), 'warning');
}

/** Delete everything about the server, as if the bot was just added. */
export async function deleteServerData(context: SettingsContext, t: Translate): Promise<ResponsePayload> {
  const guildId = context.guild!.id;
  await takeBackRoles(context.client, await getGivenRoles({ guildId }));
  // After a count that's being handled, so it doesn't save into what was just deleted
  await runCountingTask(guildId, () => deleteGuildData(guildId));
  forgetLogConfig(guildId);
  await getGuildOrCreate(guildId);
  return createResponse(t('privacy.guild.deleted'), 'warning');
}
