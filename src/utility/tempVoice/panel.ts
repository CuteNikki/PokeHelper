import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
  quote,
  type Guild,
} from 'discord.js';

import { getTempVoiceChannel, updateTempVoiceChannel } from 'database/tempVoice';

import { getTranslate, type Translate } from 'utility/i18next';
import { logger } from 'utility/logger';
import type { ResponsePayload } from 'utility/response';
import { channelLabel, type TempChannel } from 'utility/tempVoice/channel';
import { ThemeColors } from 'utility/theme';

/**
 * A temporary channel's control panel: what it's like right now and everything that changes it, in one message at the top of its chat,
 * edited whenever anything does. The same panel can be shown to its owner anywhere with /voice, since every control says which channel
 * it's for.
 *
 * Custom IDs are `tempvoice:<action>:<channel>`, and `tempvoice:<action>:<channel>:<member>` for what's done to someone in it.
 */
export const TEMP_VOICE_CUSTOM_ID_PREFIX = 'tempvoice:';
/** The popup to rename a channel and set its limit, followed by the channel's ID. */
export const TEMP_VOICE_EDIT_MODAL_PREFIX = 'tempvoice-edit:';

export type TempVoiceAction = 'lock' | 'hide' | 'edit' | 'delete' | 'allow' | 'block' | 'member' | 'handover' | 'kick' | 'keepout';
const ACTIONS: TempVoiceAction[] = ['lock', 'hide', 'edit', 'delete', 'allow', 'block', 'member', 'handover', 'kick', 'keepout'];

/** Discord's user selects pick at most 25 people. */
const MAX_PICKED = 25;
/** How long to wait for more changes before editing the panel, so a few people joining at once edit it once. */
const REFRESH_DELAY = 1_000;

/** The language of messages in a server's channels, which everyone there reads. */
export const serverTranslate = (guild: Guild): Translate => getTranslate(guild.preferredLocale);

export const tempVoiceCustomId = (action: TempVoiceAction, channelId: string, memberId?: string) =>
  `${TEMP_VOICE_CUSTOM_ID_PREFIX}${action}:${channelId}${memberId ? `:${memberId}` : ''}`;

/** What a control does, the channel it's for, and who, or null if it isn't one. */
export function parseTempVoiceCustomId(customId: string): { action: TempVoiceAction; channelId: string; memberId: string | null } | null {
  if (!customId.startsWith(TEMP_VOICE_CUSTOM_ID_PREFIX)) return null;
  const [action, channelId, memberId, ...rest] = customId.slice(TEMP_VOICE_CUSTOM_ID_PREFIX.length).split(':');
  if (!ACTIONS.includes(action as TempVoiceAction) || !channelId || rest.length > 0) return null;
  return { action: action as TempVoiceAction, channelId, memberId: memberId ?? null };
}

/** The panel for a channel, as it is now. */
export function buildPanel({ channel, record }: TempChannel, t: Translate): ResponsePayload {
  const id = channel.id;
  const here = channel.members.filter((member) => !member.user.bot);
  const others = here.filter((member) => member.id !== record.ownerId);

  // Rows like the settings panels': a bold name and a short description, with the button on the right
  const row = (label: string, description: string, button: ButtonBuilder, value?: string) =>
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([`**${label}**`, `-# ${description}`, value].filter(Boolean).join('\n')))
      .setButtonAccessory(button);
  const toggle = (action: TempVoiceAction, on: boolean) =>
    new ButtonBuilder()
      .setCustomId(tempVoiceCustomId(action, id))
      .setLabel(t(on ? 'state.on' : 'state.off'))
      .setEmoji(on ? '✅' : '✖️')
      .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
  const heading = (text: string) => new TextDisplayBuilder().setContent(`**${text}**`);

  const allowed = new UserSelectMenuBuilder()
    .setCustomId(tempVoiceCustomId('allow', id))
    .setPlaceholder(t('tempVoice.panel.allowPlaceholder'))
    .setMinValues(0)
    .setMaxValues(MAX_PICKED);
  if (record.allowed.length > 0) allowed.setDefaultUsers(record.allowed.slice(0, MAX_PICKED));
  const blocked = new UserSelectMenuBuilder()
    .setCustomId(tempVoiceCustomId('block', id))
    .setPlaceholder(t('tempVoice.panel.blockPlaceholder'))
    .setMinValues(0)
    .setMaxValues(MAX_PICKED);
  if (record.blocked.length > 0) blocked.setDefaultUsers(record.blocked.slice(0, MAX_PICKED));

  // Always there, so the panel doesn't change shape when someone joins, and greyed out until there's someone to pick
  const someone = new StringSelectMenuBuilder().setCustomId(tempVoiceCustomId('member', id));
  if (others.size > 0) {
    someone
      .setPlaceholder(t('tempVoice.panel.memberPlaceholder'))
      .addOptions(others.first(MAX_PICKED).map((member) => ({ label: member.displayName.slice(0, 100), value: member.id })));
  } else {
    someone.setPlaceholder(t('tempVoice.panel.nobodyHere')).addOptions({ label: '-', value: 'nobody' }).setDisabled(true);
  }

  const owner = t('tempVoice.panel.owner', { owner: `<@${record.ownerId}>` }) + (here.has(record.ownerId) ? '' : ` ${t('tempVoice.panel.ownerAway')}`);
  const people = channel.userLimit
    ? t('tempVoice.panel.peopleLimit', { count: here.size, limit: channel.userLimit })
    : t('tempVoice.panel.people', { count: here.size });
  const name = channelLabel(record.namePrefix, channel.name);
  const nameAndLimit = channel.userLimit ? t('tempVoice.panel.nameWithLimit', { name, count: channel.userLimit }) : name;

  const container = new ContainerBuilder()
    .setAccentColor(ThemeColors.info)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${t('tempVoice.panel.title')}\n${owner} · ${people}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(
      row(t('tempVoice.panel.locked'), t('tempVoice.panel.lockedDescription'), toggle('lock', record.locked)),
      row(t('tempVoice.panel.hidden'), t('tempVoice.panel.hiddenDescription'), toggle('hide', record.hidden)),
      row(
        t('tempVoice.panel.edit'),
        t('tempVoice.panel.editDescription'),
        new ButtonBuilder().setCustomId(tempVoiceCustomId('edit', id)).setLabel(t('settings.text.edit')).setEmoji('✏️').setStyle(ButtonStyle.Primary),
        // Quoted, like the value of a text setting
        quote(nameAndLimit),
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(heading(t('tempVoice.panel.allowed')))
    .addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(allowed))
    .addTextDisplayComponents(heading(t('tempVoice.panel.blocked')))
    .addActionRowComponents(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(blocked))
    .addTextDisplayComponents(heading(t('tempVoice.panel.someone')))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(someone))
    // More space above the button at the bottom, like on the settings panels
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(tempVoiceCustomId('delete', id)).setLabel(t('tempVoice.panel.delete')).setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
    );

  // The owner's mention pings them when the panel is posted, so they find their controls. Edits keep it allowed too:
  // an edit that didn't would take the mention, and its notification, back. Edits never ping
  return { components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { users: [record.ownerId] } };
}

/** Posts a new channel's panel in its chat, and remembers it to keep it up to date. */
export async function postPanel(temp: TempChannel) {
  const message = await temp.channel.send(buildPanel(temp, serverTranslate(temp.channel.guild))).catch((error: unknown) => {
    logger.error(error, 'Failed to post a temporary voice channel panel');
    return null;
  });
  if (message) temp.record = await updateTempVoiceChannel(temp.channel.id, { panelMessageId: message.id });
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Brings a channel's panel up to date, a moment after the last change. Posts it again if someone deleted it. */
export function refreshPanel(temp: TempChannel) {
  clearTimeout(pending.get(temp.channel.id));
  pending.set(
    temp.channel.id,
    setTimeout(() => {
      pending.delete(temp.channel.id);
      void (async () => {
        // Read again, in case the channel changed or is gone since
        const record = await getTempVoiceChannel(temp.channel.id);
        if (!record || !temp.channel.guild.channels.cache.has(temp.channel.id)) return;
        const current = { channel: temp.channel, record };
        // Not posted yet: it's being posted right now, and posting here too would make two
        if (!record.panelMessageId) return;
        await temp.channel.messages.edit(record.panelMessageId, buildPanel(current, serverTranslate(temp.channel.guild))).catch(async (error: unknown) => {
          logger.debug(error, 'Temporary voice channel panel gone, posting it again');
          await postPanel(current);
        });
      })().catch((error: unknown) => logger.error(error, 'Failed to refresh a temporary voice channel panel'));
    }, REFRESH_DELAY),
  );
}

/** A note in a channel's chat for everyone there, like who owns it now. Mentions in it only ping those in `ping`. */
export async function announce(temp: TempChannel, text: string, ping: string[] = []) {
  await temp.channel
    .send({
      components: [new ContainerBuilder().setAccentColor(ThemeColors.info).addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
      flags: [MessageFlags.IsComponentsV2],
      allowedMentions: { users: ping },
    })
    .catch((error: unknown) => logger.error(error, 'Failed to post in a temporary voice channel'));
}
