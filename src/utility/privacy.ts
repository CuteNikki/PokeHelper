import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ButtonInteraction,
  type PermissionsString,
} from 'discord.js';

import { getGuildOrCreate } from 'database/guild';
import { deleteGuildData, deleteUserData, getGuildData, getUserData } from 'database/privacy';

import { runCountingTask } from 'utility/counting/game';
import { buildConfirmation } from 'utility/confirm';
import { getTranslate, type Translate } from 'utility/i18next';
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
  const file =
    scope === 'user'
      ? jsonFile({ exportedAt, ...(await getUserData(interaction.user.id)) }, `poke-helper-user-${interaction.user.id}.json`)
      : jsonFile({ exportedAt, ...(await getGuildData(interaction.guildId!)) }, `poke-helper-server-${interaction.guildId}.json`);
  return interaction.editReply({ ...createResponse(t(`privacy.${scope}.downloaded`), 'success'), files: [file] });
}

/** Delete everything about whoever confirmed, in every server. */
export async function deleteOwnData(context: SettingsContext, t: Translate): Promise<ResponsePayload> {
  await deleteUserData(context.userId);
  return createResponse(t('privacy.user.deleted'), 'warning');
}

/** Delete everything about the server, as if the bot was just added. */
export async function deleteServerData(context: SettingsContext, t: Translate): Promise<ResponsePayload> {
  const guildId = context.guild!.id;
  // After a count that's being handled, so it doesn't save into what was just deleted
  await runCountingTask(guildId, () => deleteGuildData(guildId));
  forgetLogConfig(guildId);
  await getGuildOrCreate(guildId);
  return createResponse(t('privacy.guild.deleted'), 'warning');
}
